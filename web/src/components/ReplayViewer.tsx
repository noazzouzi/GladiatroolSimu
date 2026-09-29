/**
 * Rejeu pas à pas d'un combat (simulation complète ou plan appliqué) : carte animée sobrement, action du pas tracée,
 * chronologie par tour global et par action, lecture automatique, PV de tous, objectif, cadeaux, journal français
 * filtrable et synchronisé ; « Planifier depuis ici ».
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Catalog, LineKind, MapFighter, Replay } from '../model/types.js';
import { FighterList } from './common.js';
import { Icon } from './Icon.js';
import { MapLegend, MapView, type MapOverlay } from './MapView.js';

const FILTERS: { id: string; label: string; kinds: LineKind[] }[] = [
  { id: 'plans', label: 'Plans', kinds: ['plan'] },
  { id: 'choix', label: 'Choix', kinds: ['choice'] },
  { id: 'lancers', label: 'Lancers', kinds: ['cast'] },
  { id: 'degats', label: 'Dégâts et morts', kinds: ['damage'] },
  { id: 'deplacements', label: 'Déplacements', kinds: ['move'] },
  { id: 'etats', label: 'États', kinds: ['state'] },
  { id: 'scenario', label: 'Scénario', kinds: ['scenario', 'warn', 'result'] },
];
const ALWAYS: LineKind[] = ['turn', 'fighter', 'blank'];

const SPEEDS = [
  { ms: 1400, label: 'lente' },
  { ms: 700, label: 'normale' },
  { ms: 300, label: 'rapide' },
];

interface Props {
  id: string;
  catalog: Catalog;
  replay: Replay;
  onPlanFrom?: (frame: number) => void;
  planFromDisabled?: boolean;
  header?: React.ReactNode;
  initialFrame?: number;
}

export function ReplayViewer({ id, catalog, replay, onPlanFrom, planFromDisabled, header, initialFrame = 0 }: Props) {
  const [idx, setIdx] = useState(initialFrame);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(700);
  const [filters, setFilters] = useState<Set<string>>(() => new Set(FILTERS.map((f) => f.id)));
  const [scope, setScope] = useState<'tour' | 'tout'>('tour');
  const [query, setQuery] = useState('');
  const journalRef = useRef<HTMLDivElement>(null);
  const n = replay.frames.length;
  const frame = replay.frames[Math.min(idx, n - 1)]!;
  const reduced = useMemo(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches, []);

  useEffect(() => {
    setIdx(Math.min(initialFrame, n - 1));
    setPlaying(false);
  }, [replay, initialFrame, n]);

  useEffect(() => {
    if (!playing) return;
    if (idx >= n - 1) {
      setPlaying(false);
      return;
    }
    const t = window.setTimeout(() => setIdx((i) => Math.min(n - 1, i + 1)), speed);
    return () => window.clearTimeout(t);
  }, [playing, idx, n, speed]);

  const statics = useMemo(() => new Map(replay.statics.map((s) => [s.id, s])), [replay]);
  const fighters: MapFighter[] = useMemo(
    () =>
      frame.fighters
        .map((d): MapFighter | null => {
          const s = statics.get(d.id);
          return s ? { ...s, ...d, current: d.id === frame.activeId } : null;
        })
        .filter((x): x is MapFighter => x !== null),
    [frame, statics],
  );
  const listed = useMemo(() => {
    const players = fighters.filter((f) => f.kind === 'player');
    const others = fighters.filter((f) => f.kind !== 'player' && f.alive);
    return [...players, ...others];
  }, [fighters]);

  const overlay: MapOverlay | null = frame.action ? { groups: [{ actions: [frame.action], tone: statics.get(frame.action.actorId)?.kind === 'player' ? 'plan' : 'monster', startNumber: 1, key: 'f' }] } : null;

  const turnIdx = useMemo(() => {
    let k = 0;
    for (let i = 0; i < replay.turnStarts.length; i++) if (replay.turnStarts[i]!.frame <= idx) k = i;
    return k;
  }, [replay, idx]);
  const turnRange: [number, number] = [replay.turnStarts[turnIdx]?.frame ?? 0, (replay.turnStarts[turnIdx + 1]?.frame ?? n) - 1];

  const goTurn = (delta: number) => {
    const t = Math.max(0, Math.min(replay.turnStarts.length - 1, turnIdx + delta));
    setIdx(replay.turnStarts[t]!.frame);
  };

  // journal
  const allowed = useMemo(() => {
    const s = new Set<LineKind>(ALWAYS);
    for (const f of FILTERS) if (filters.has(f.id)) f.kinds.forEach((k) => s.add(k));
    return s;
  }, [filters]);
  const lineRange: [number, number] = scope === 'tout' ? [0, replay.lines.length] : [replay.frames[turnRange[0]]!.lines[0], replay.frames[turnRange[1]]!.lines[1]];
  const lineFrame = useMemo(() => {
    const out = new Int32Array(replay.lines.length);
    replay.frames.forEach((f, i) => {
      for (let l = f.lines[0]; l < f.lines[1]; l++) out[l] = i;
    });
    return out;
  }, [replay]);
  const q = query.trim().toLowerCase();
  const shown = useMemo(() => {
    const out: number[] = [];
    for (let l = lineRange[0]; l < lineRange[1]; l++) {
      const k = replay.kinds[l]!;
      if (!allowed.has(k)) continue;
      if (q && !replay.lines[l]!.toLowerCase().includes(q)) continue;
      if (k === 'blank' && (q || out.length === 0)) continue;
      out.push(l);
    }
    return out;
  }, [lineRange[0], lineRange[1], allowed, q, replay]);

  useEffect(() => {
    const box = journalRef.current;
    const el = box?.querySelector<HTMLElement>('.journal-line.current');
    if (box && el) {
      const top = el.offsetTop - box.offsetTop;
      if (top < box.scrollTop || top > box.scrollTop + box.clientHeight - 40) box.scrollTop = Math.max(0, top - 60);
    }
  }, [idx, shown]);

  const canPlan = onPlanFrom && replay.frames.slice(idx).some((f) => f.playerTurn);

  return (
    <div className="split">
      <section className="panel" aria-label="Carte du rejeu">
        {header}
        <MapView id={`${id}-carte`} map={catalog.map} fighters={fighters} gifts={frame.gifts} overlay={overlay} animate={!reduced} ariaLabel={`Carte au pas ${idx + 1} sur ${n}`} />
        <div className="frame-label" aria-live="polite">
          <span className="chip mono">T{frame.turn}</span> <span className="mono small muted">{idx + 1} / {n}</span> — {frame.label}
          {frame.action && frame.action.damage.length ? (
            <span className="small muted">
              {' '}
              ({frame.action.damage.map((d) => `${d.name} −${d.amount.toLocaleString('fr-FR')}${d.killed ? ', mort' : ''}`).join(' ; ')})
            </span>
          ) : null}
        </div>
        <div className="replay-controls" style={{ marginTop: 6 }}>
          <button type="button" className="btn btn-icon" id={`${id}-debut`} aria-label="Début" onClick={() => setIdx(0)} disabled={idx === 0}>
            <Icon name="first" />
          </button>
          <button type="button" className="btn btn-icon" id={`${id}-tour-prec`} aria-label="Tour global précédent" onClick={() => goTurn(idx > turnRange[0] ? 0 : -1)} disabled={idx === 0}>
            <Icon name="prevTurn" />
          </button>
          <button type="button" className="btn btn-icon" id={`${id}-prec`} aria-label="Action précédente" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0}>
            <Icon name="prev" />
          </button>
          <button type="button" className="btn btn-icon btn-primary" id={`${id}-lecture`} aria-label={playing ? 'Pause' : 'Lecture'} onClick={() => (idx >= n - 1 ? (setIdx(0), setPlaying(true)) : setPlaying((p) => !p))}>
            <Icon name={playing ? 'pause' : 'play'} />
          </button>
          <button type="button" className="btn btn-icon" id={`${id}-suiv`} aria-label="Action suivante" onClick={() => setIdx((i) => Math.min(n - 1, i + 1))} disabled={idx >= n - 1}>
            <Icon name="next" />
          </button>
          <button type="button" className="btn btn-icon" id={`${id}-tour-suiv`} aria-label="Tour global suivant" onClick={() => goTurn(1)} disabled={turnIdx >= replay.turnStarts.length - 1}>
            <Icon name="nextTurn" />
          </button>
          <button type="button" className="btn btn-icon" id={`${id}-fin`} aria-label="Fin" onClick={() => setIdx(n - 1)} disabled={idx >= n - 1}>
            <Icon name="last" />
          </button>
          <label className="sr-only" htmlFor={`${id}-curseur`}>
            Position dans le rejeu
          </label>
          <input className="scrub" id={`${id}-curseur`} type="range" min={0} max={n - 1} value={idx} onChange={(e) => setIdx(Number(e.target.value))} />
          <label className="sr-only" htmlFor={`${id}-vitesse`}>
            Vitesse
          </label>
          <select id={`${id}-vitesse`} value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            {SPEEDS.map((s) => (
              <option key={s.ms} value={s.ms}>
                vitesse {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="turn-strip" role="group" aria-label="Tours globaux">
          {replay.turnStarts.map((t, i) => (
            <button key={t.turn} type="button" id={`${id}-tour-${t.turn}`} className="btn btn-small" aria-pressed={i === turnIdx} onClick={() => setIdx(t.frame)}>
              T{t.turn}
            </button>
          ))}
        </div>
        {onPlanFrom ? (
          <div className="row">
            <button type="button" className="btn btn-stripe" id={`${id}-planifier-ici`} disabled={!canPlan || planFromDisabled} onClick={() => onPlanFrom(idx)}>
              <Icon name="target" /> Planifier depuis ici
            </button>
            <span className="small muted">{frame.playerTurn ? 'État exact à ce pas (rejeu de la trace).' : 'Le prochain tour de joueur après ce pas sera repris.'}</span>
          </div>
        ) : null}
        <MapLegend plan />
      </section>
      <div className="stack">
        <section className="panel" aria-label="État au pas courant">
          <div className="row-between">
            <h3 style={{ margin: 0 }}>Tour {frame.turn}</h3>
            <span className="small">
              {frame.objective ? (
                <>
                  Objectif : <strong>{frame.objective}</strong>
                </>
              ) : (
                <span className="muted">aucun objectif en cours</span>
              )}{' '}
              — <span className="num">{frame.objectivesDone}</span> réalisé(s)
              {frame.gifts.length ? (
                <>
                  {' '}
                  — cadeaux : <span className="mono">{frame.gifts.join(', ')}</span>
                </>
              ) : null}
            </span>
          </div>
          <div style={{ marginTop: 8 }}>
            <FighterList fighters={listed} />
          </div>
        </section>
        <section className="panel" aria-label="Journal">
          <div className="row-between">
            <h3 style={{ margin: 0 }}>Journal</h3>
            <div className="seg" role="group" aria-label="Étendue du journal">
              <button type="button" className="btn btn-small" id={`${id}-journal-tour`} aria-pressed={scope === 'tour'} onClick={() => setScope('tour')}>
                Tour courant
              </button>
              <button type="button" className="btn btn-small" id={`${id}-journal-tout`} aria-pressed={scope === 'tout'} onClick={() => setScope('tout')}>
                Tout le combat
              </button>
            </div>
          </div>
          <div className="row" style={{ margin: '8px 0' }}>
            {FILTERS.map((f) => (
              <label key={f.id} className="inline small">
                <input
                  type="checkbox"
                  id={`${id}-filtre-${f.id}`}
                  checked={filters.has(f.id)}
                  onChange={(e) => {
                    const next = new Set(filters);
                    if (e.target.checked) next.add(f.id);
                    else next.delete(f.id);
                    setFilters(next);
                  }}
                />
                {f.label}
              </label>
            ))}
          </div>
          <label className="sr-only" htmlFor={`${id}-recherche`}>
            Rechercher dans le journal
          </label>
          <input id={`${id}-recherche`} type="text" placeholder="Rechercher (nom, sort, case…)" value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
          <div className="journal" ref={journalRef} role="log" aria-label="Journal du combat">
            {shown.length === 0 ? <div className="journal-line muted">Aucune ligne.</div> : null}
            {shown.map((l) => {
              const fi = lineFrame[l]!;
              return (
                <div key={l} className={`journal-line k-${replay.kinds[l]}${fi === idx ? ' current' : ''}`} onClick={() => setIdx(fi)}>
                  {replay.lines[l] || ' '}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
