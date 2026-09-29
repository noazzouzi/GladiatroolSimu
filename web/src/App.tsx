/**
 * Application : en-tête, onglets, état global (catalogue, situation éditée, vue du combat, plans, simulation) et
 * tâches longues déléguées au worker (progression, annulation).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ProgressView } from './components/common.js';
import { openingSituation } from './model/situationEdit.js';
import type { ApplyResult, BestTurnResult, Catalog, FightView, PlannerMode, Progress, SimResult, SimSpec, Situation } from './model/types.js';
import { BestTurnScreen } from './screens/BestTurnScreen.js';
import { HelpScreen } from './screens/HelpScreen.js';
import { ResultsScreen } from './screens/ResultsScreen.js';
import { SimulationScreen } from './screens/SimulationScreen.js';
import { SituationScreen } from './screens/SituationScreen.js';
import { CancelledError, SimClient } from './worker/client.js';

export type TabId = 'carte' | 'meilleur' | 'simulation' | 'resultats' | 'aide';
const TABS: { id: TabId; label: string }[] = [
  { id: 'carte', label: 'Carte & situation' },
  { id: 'meilleur', label: 'Meilleur tour' },
  { id: 'simulation', label: 'Simulation' },
  { id: 'resultats', label: 'Résultats' },
  { id: 'aide', label: 'Aide' },
];

type Theme = 'auto' | 'light' | 'dark';

export type Source = { kind: 'situation' } | { kind: 'exact'; label: string };

export interface LoadState {
  view: FightView | null;
  warnings: string[];
  error: string | null;
  pending: boolean;
}

export interface Task {
  kind: 'plan' | 'apply' | 'simulate' | 'point';
  progress: Progress;
  startedAt: number;
}

// préférences (localStorage : confort seulement, jamais indispensable)
function readPref(key: string): string | null {
  try {
    return window.localStorage.getItem(`gladiatrool.${key}`);
  } catch {
    return null;
  }
}
function writePref(key: string, value: string): void {
  try {
    window.localStorage.setItem(`gladiatrool.${key}`, value);
  } catch {
    /* stockage indisponible */
  }
}

const LOST = 'L\'état exact est perdu (worker relancé) : la situation décrite a été reconstruite.';

let clientSingleton: SimClient | null = null;
function getClient(): SimClient {
  clientSingleton ??= new SimClient();
  return clientSingleton;
}

export function App() {
  const client = getClient();
  const [tab, setTabRaw] = useState<TabId>(() => {
    const t = readPref('onglet') as TabId | null;
    return t && TABS.some((x) => x.id === t) ? t : 'carte';
  });
  const [theme, setTheme] = useState<Theme>(() => (readPref('theme') as Theme | null) ?? 'auto');
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [situation, setSituation] = useState<Situation>(openingSituation);
  const [source, setSource] = useState<Source>({ kind: 'situation' });
  const [load, setLoad] = useState<LoadState>({ view: null, warnings: [], error: null, pending: true });
  const [best, setBest] = useState<BestTurnResult | null>(null);
  const [applied, setApplied] = useState<ApplyResult | null>(null);
  const [sim, setSim] = useState<SimResult | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mode, setMode] = useState<'worker' | 'thread'>(client.mode);
  const loadSeq = useRef(0);
  const [reloadKey, setReloadKey] = useState(0);

  const setTab = useCallback((t: TabId) => {
    setTabRaw(t);
    writePref('onglet', t);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'auto') delete root.dataset.theme;
    else root.dataset.theme = theme;
    writePref('theme', theme);
  }, [theme]);

  // catalogue
  useEffect(() => {
    let alive = true;
    client
      .request({ type: 'init' })
      .then((c) => alive && setCatalog(c))
      .catch((e: Error) => alive && setFatal(e.message));
    client.onRestart = () => {
      setMode(client.mode);
      // pas d'effet de bord dans une fonction de mise à jour : on lit la source courante par la référence
      if (sourceRef.current.kind === 'exact') setNotice(LOST);
      setSource({ kind: 'situation' });
      setReloadKey((k) => k + 1);
      if (!catalogRef.current) client.request({ type: 'init' }).then(setCatalog).catch((e: Error) => setFatal(e.message));
    };
    return () => {
      alive = false;
    };
  }, [client]);
  const catalogRef = useRef<Catalog | null>(null);
  catalogRef.current = catalog;
  const sourceRef = useRef<Source>(source);
  sourceRef.current = source;

  // reconstruction de la situation éditée (anti-rebond)
  useEffect(() => {
    if (!catalog || source.kind !== 'situation') return;
    const seq = ++loadSeq.current;
    setLoad((l) => ({ ...l, pending: true }));
    const t = window.setTimeout(() => {
      client
        .request({ type: 'load', situation })
        .then((r) => {
          if (seq !== loadSeq.current) return;
          setLoad({ view: r.view, warnings: r.warnings, error: null, pending: false });
        })
        .catch((e: Error) => {
          if (seq !== loadSeq.current || e instanceof CancelledError) return;
          setLoad((l) => ({ ...l, error: e.message, pending: false }));
        });
    }, 160);
    return () => window.clearTimeout(t);
  }, [catalog, situation, source, client, reloadKey]);

  /** Modification de la situation par l'éditeur : repasse en mode « situation décrite ». */
  const editSituation = useCallback((next: Situation) => {
    setSituation(next);
    setSource({ kind: 'situation' });
    setBest(null);
    setApplied(null);
    setNotice(null);
  }, []);

  const run = useCallback(
    async <T,>(kind: Task['kind'], first: string, fn: (onProgress: (p: Progress) => void) => Promise<T>): Promise<T | null> => {
      setTask({ kind, progress: { phase: first, fraction: null }, startedAt: Date.now() });
      setNotice(null);
      try {
        return await fn((p) => setTask((t) => (t ? { ...t, progress: p } : t)));
      } catch (e) {
        // garde l'avertissement de perte de l'état exact posé par onRestart pendant ce calcul
        const lost = (n: string | null) => (n === LOST ? ` ${LOST}` : '');
        if (e instanceof CancelledError) setNotice((n) => `Calcul annulé.${lost(n)}`);
        else setNotice((n) => `Erreur : ${(e as Error).message}${lost(n)}`);
        return null;
      } finally {
        setTask(null);
      }
    },
    [],
  );

  const plan = useCallback(
    async (m: PlannerMode, team: boolean) => {
      setApplied(null);
      const r = await run('plan', 'Recherche du meilleur tour…', (p) => client.request({ type: 'plan', mode: m, team }, p));
      if (r) setBest(r);
    },
    [client, run],
  );

  const apply = useCallback(
    async (src: 'best' | 'alt' | 'team', index: number, rolls: 'average' | 'random', wholeTeam: boolean) => {
      const r = await run('apply', 'Application du plan…', (p) => client.request({ type: 'apply', source: src, index, rolls, wholeTeam }, p));
      if (!r) return;
      setApplied(r);
      setBest(null);
      setSituation(r.situation);
      setSource({ kind: 'exact', label: r.situation.description ?? 'État après application du plan' });
      setLoad({ view: r.view, warnings: [], error: null, pending: false });
    },
    [client, run],
  );

  const simulate = useCallback(
    async (spec: SimSpec) => {
      const r = await run('simulate', 'Lancement du combat…', (p) => client.request({ type: 'simulate', spec }, p));
      if (r) setSim(r);
    },
    [client, run],
  );

  const planFromFrame = useCallback(
    async (frame: number) => {
      const r = await run('point', 'Reconstruction de l\'état…', (p) => client.request({ type: 'point', frame }, p));
      if (!r) return;
      setSituation(r.situation);
      setSource({ kind: 'exact', label: r.label });
      setLoad({ view: r.view, warnings: r.warnings, error: null, pending: false });
      setBest(null);
      setApplied(null);
      setTab('meilleur');
    },
    [client, run, setTab],
  );

  const cancel = useCallback(() => client.cancel(), [client]);

  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const n = TABS.length;
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + n) % n;
    setTab(TABS[j]!.id);
    document.getElementById(`onglet-${TABS[j]!.id}`)?.focus();
  };

  const busy = task !== null;
  const progressBox = task ? <ProgressView progress={task.progress} startedAt={task.startedAt} onCancel={client.mode === 'worker' ? cancel : undefined} /> : null;

  return (
    <>
      <header className="app-header">
        <div className="header-inner">
          <div className="brand">
            <svg width="34" height="34" viewBox="0 0 32 32" aria-hidden="true">
              <path d="M16 2 30 16 16 30 2 16Z" fill="var(--tent-ink)" fillOpacity="0.15" stroke="var(--tent-ink)" strokeWidth="1.5" />
              <path d="M8 20l3-7 2.5 7 2.5-7 2.5 7 2.5-7 3 7" stroke="var(--tent-ink)" strokeWidth="2" fill="none" strokeLinejoin="round" />
            </svg>
            <div>
              <h1>Simulateur Gladiatrool</h1>
              <small>DOFUS 3 — carte, meilleur tour, simulation, résultats</small>
            </div>
          </div>
          <div className="header-tools">
            <span className="worker-badge" title={mode === 'worker' ? 'Les calculs tournent dans un Web Worker' : 'Web Worker indisponible : calculs dans le fil principal'}>
              {mode === 'worker' ? 'calcul : worker' : 'calcul : fil principal'}
            </span>
            <label className="sr-only" htmlFor="choix-theme">
              Thème
            </label>
            <select id="choix-theme" value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
              <option value="auto">Thème : système</option>
              <option value="light">Thème : clair</option>
              <option value="dark">Thème : sombre</option>
            </select>
          </div>
          <nav className="tabs" role="tablist" aria-label="Écrans">
            {TABS.map((t, i) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`onglet-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`ecran-${t.id}`}
                tabIndex={tab === t.id ? 0 : -1}
                className="tab"
                onClick={() => setTab(t.id)}
                onKeyDown={(e) => onTabKey(e, i)}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main id={`ecran-${tab}`} role="tabpanel" aria-labelledby={`onglet-${tab}`}>
        {fatal ? <div className="notice bad">Impossible de démarrer le simulateur : {fatal}</div> : null}
        {notice ? (
          <div className="notice warn" role="status" style={{ marginBottom: 14 }}>
            {notice}
          </div>
        ) : null}
        {!catalog && !fatal && tab !== 'resultats' && tab !== 'aide' ? <div className="panel">Chargement des données du jeu…</div> : null}
        {catalog && tab === 'carte' ? (
          <SituationScreen catalog={catalog} situation={situation} source={source} load={load} onEdit={editSituation} onGoPlan={() => setTab('meilleur')} />
        ) : null}
        {catalog && tab === 'meilleur' ? (
          <BestTurnScreen
            catalog={catalog}
            load={load}
            source={source}
            best={best}
            applied={applied}
            busy={busy}
            progress={task && (task.kind === 'plan' || task.kind === 'apply' || task.kind === 'point') ? progressBox : null}
            onPlan={plan}
            onApply={apply}
            onCloseApplied={() => setApplied(null)}
            onEditSituation={() => setTab('carte')}
          />
        ) : null}
        {catalog && tab === 'simulation' ? (
          <SimulationScreen catalog={catalog} sim={sim} busy={busy} progress={task && task.kind === 'simulate' ? progressBox : null} onSimulate={simulate} onPlanFrom={planFromFrame} />
        ) : null}
        {tab === 'resultats' ? <ResultsScreen /> : null}
        {tab === 'aide' ? <HelpScreen /> : null}
      </main>
    </>
  );
}
