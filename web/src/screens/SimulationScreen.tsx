/**
 * Écran « Simulation » : combat complet joué par le planificateur (worker, mode fast par défaut) avec une
 * composition, une graine et des hypothèses clés ; bilan puis rejeu pas à pas ; « Planifier depuis ici ».
 */
import { useState } from 'react';
import { Icon } from '../components/Icon.js';
import { ReplayViewer } from '../components/ReplayViewer.js';
import { fmtInt, fmtMs, fmtPct } from '../model/format.js';
import type { Catalog, ConfigOverrides, ParamInfo, PlannerMode, SimResult, SimSpec } from '../model/types.js';

const COMPOS = [
  { id: 'ADDM', label: 'ADDM — Acrobate, Dompteur, Dompteur, Magicien' },
  { id: 'AADM', label: 'AADM — Acrobate, Acrobate, Dompteur, Magicien' },
  { id: 'AAMD', label: 'AAMD' },
  { id: 'ADMD', label: 'ADMD' },
  { id: 'ADMM', label: 'ADMM' },
  { id: 'AMDD', label: 'AMDD' },
  { id: 'DADM', label: 'DADM' },
  { id: 'ADDD', label: 'ADDD' },
  { id: 'DDDM', label: 'DDDM (sans Acrobate)' },
  { id: 'ADM', label: 'ADM (3 joueurs)' },
];

interface Props {
  catalog: Catalog;
  sim: SimResult | null;
  busy: boolean;
  progress: React.ReactNode;
  onSimulate: (spec: SimSpec) => void;
  onPlanFrom: (frame: number) => void;
}

/** Surcharges de configuration (forme de ``sim/config/default.config.json``) des valeurs différentes du défaut. */
export function overridesFrom(params: ParamInfo[], values: Record<string, unknown>): ConfigOverrides {
  const out: Record<string, Record<string, unknown>> = {};
  for (const p of params) {
    const v = values[p.path];
    if (v === undefined || v === p.default) continue;
    const [section, key] = p.path.split('.') as [string, string];
    (out[section] ??= {})[key] = v;
  }
  return out as ConfigOverrides;
}

export function SimulationScreen({ catalog, sim, busy, progress, onSimulate, onPlanFrom }: Props) {
  const [compoSel, setCompoSel] = useState('ADDM');
  const [free, setFree] = useState('ADDM');
  const [seed, setSeed] = useState(42);
  const [mode, setMode] = useState<PlannerMode>('fast');
  const [maxTurn, setMaxTurn] = useState(catalog.maxTurnDefault);
  const [monsters, setMonsters] = useState<'ai' | 'simple'>('ai');
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [err, setErr] = useState<string | null>(null);

  const compo = compoSel === 'libre' ? free.trim().toUpperCase() : compoSel;
  const valueOf = (p: ParamInfo) => (values[p.path] ?? p.default) as never;
  const set = (p: ParamInfo, v: unknown) => setValues((x) => ({ ...x, [p.path]: v }));

  const launch = () => {
    if (!/^[ADM]{1,4}(@\d+(,\d+){0,3})?$/.test(compo)) {
      setErr('Composition : 1 à 4 lettres A / D / M (ordre de jeu), placement facultatif « @287,314,286,315 ».');
      return;
    }
    setErr(null);
    onSimulate({ compo, seed: Math.round(seed) || 1, mode, maxTurn, monsters, overrides: overridesFrom(catalog.params, values) });
  };

  const s = sim?.summary;
  return (
    <div className="stack">
      <section className="panel" aria-labelledby="titre-simulation">
        <h2 id="titre-simulation">Simuler un combat complet</h2>
        <p className="lede small">
          Les joueurs sont joués par le planificateur, les monstres par l'IA du module <code>ai</code>, les choix (Acclamations, cadeaux, votes) par les
          politiques. Jets aléatoires tirés de la graine : même graine et mêmes hypothèses, même combat.
        </p>
        <div className="grid-form">
          <label className="field" htmlFor="sim-compo">
            Composition (ordre de jeu)
            <select id="sim-compo" value={compoSel} onChange={(e) => setCompoSel(e.target.value)}>
              {COMPOS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
              <option value="libre">libre…</option>
            </select>
          </label>
          {compoSel === 'libre' ? (
            <label className="field" htmlFor="sim-compo-libre">
              Composition libre
              <input id="sim-compo-libre" type="text" value={free} onChange={(e) => setFree(e.target.value)} placeholder="AADM@287,314,286,315" />
            </label>
          ) : null}
          <label className="field" htmlFor="sim-graine">
            Graine
            <input id="sim-graine" type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} />
          </label>
          <label className="field" htmlFor="sim-mode">
            Planificateur
            <select id="sim-mode" value={mode} onChange={(e) => setMode(e.target.value as PlannerMode)}>
              <option value="fast">rapide (fast, ≈ 2 à 6 s)</option>
              <option value="greedy">glouton (greedy, ≈ 1 s)</option>
              <option value="deep">approfondi (deep, plusieurs minutes)</option>
            </select>
          </label>
          <label className="field" htmlFor="sim-tours-max">
            Tours au plus
            <input id="sim-tours-max" type="number" min={1} max={30} value={maxTurn} onChange={(e) => setMaxTurn(Math.max(1, Math.min(30, Number(e.target.value) || 20)))} />
          </label>
          <label className="field" htmlFor="sim-monstres">
            IA des monstres
            <select id="sim-monstres" value={monsters} onChange={(e) => setMonsters(e.target.value as 'ai' | 'simple')}>
              <option value="ai">fidèle (module ai)</option>
              <option value="simple">simple (se rapproche et frappe)</option>
            </select>
          </label>
        </div>
        <details className="section" open>
          <summary>Hypothèses clés (sim/config)</summary>
          <div className="grid-form" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 290px), 1fr))' }}>
            {catalog.params.map((p) => (
              <ParamField key={p.path} p={p} value={valueOf(p)} onChange={(v) => set(p, v)} />
            ))}
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <button type="button" className="btn btn-small" id="sim-hypotheses-defaut" onClick={() => setValues({})}>
              Valeurs par défaut
            </button>
            <button
              type="button"
              className="btn btn-small"
              id="sim-hypotheses-pessimiste"
              onClick={() => setValues({ 'spikes.playersDoubledInside': true, 'spikes.playerTurnStartDamage': 2000, 'gifts.spawnProbability': 0.3 })}
            >
              Scénario pessimiste (Q3 + Q4 + Q14)
            </button>
          </div>
        </details>
        <div className="row" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn-primary" id="btn-lancer-combat" onClick={launch} disabled={busy}>
            <Icon name="play" /> Lancer le combat
          </button>
          {err ? <span className="small" style={{ color: 'var(--bad)' }}>{err}</span> : null}
        </div>
        {progress ? <div style={{ marginTop: 10 }}>{progress}</div> : null}
      </section>

      {sim && s ? (
        <>
          <section className="panel" aria-labelledby="titre-bilan">
            <h2 id="titre-bilan">
              {s.victory ? 'Victoire' : s.reason === 'defeat' ? 'Défaite' : 'Arrêt'} au tour {s.turnReached} — {sim.spec.compo}, graine {sim.spec.seed}
            </h2>
            <div className="kpis">
              <Kpi label="Progression (PV ennemis détruits)" value={fmtPct(s.progress)} />
              <Kpi label="Objectifs réalisés" value={String(s.objectivesCount)} />
              <Kpi label="Mama" value={s.mamaKilledTurn !== null ? `tuée au T${s.mamaKilledTurn}` : s.mamaArrived ? `${fmtInt(s.mamaHpLeft)} PV` : 'pas arrivée'} />
              <Kpi label="Joueurs morts" value={s.playerDeaths.length ? s.playerDeaths.map((d) => `${d.name} (T${d.turn})`).join(', ') : 'aucun'} />
              <Kpi label="Cadeaux ramassés / apparus" value={`${s.giftsTaken} / ${s.giftsSpawned}`} />
              <Kpi label="Durée de calcul" value={fmtMs(s.timing.totalMs)} />
            </div>
            <details className="section">
              <summary>Objectifs, choix et bonus ({s.choices.length} choix)</summary>
              <div className="split-even">
                <div>
                  <h4>Objectifs</h4>
                  <ol className="small" style={{ paddingLeft: '1.2rem' }}>
                    {s.objectives.map((o) => (
                      <li key={o.id}>
                        T{o.turn} — {o.name} <span className="muted">(palier {o.tier})</span>
                      </li>
                    ))}
                  </ol>
                </div>
                <div className="table-wrap">
                  <h4>Choix motivés</h4>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th scope="col">Tour</th>
                        <th scope="col">Choix</th>
                        <th scope="col">Qui</th>
                        <th scope="col">Option</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.choices.map((c, i) => (
                        <tr key={i} title={c.reason}>
                          <td className="num">{c.turn}</td>
                          <td>{c.kind}</td>
                          <td>{c.fighter}</td>
                          <td>
                            {c.label}
                            <div className="small muted">{c.reason}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </details>
            <p className="small muted mono" style={{ marginTop: 8 }}>
              {sim.resultLine}
            </p>
          </section>
          <ReplayViewer id="rejeu-simulation" catalog={catalog} replay={sim.replay} onPlanFrom={onPlanFrom} planFromDisabled={busy} header={<h2>Rejeu pas à pas</h2>} />
        </>
      ) : null}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="kpi">
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{label}</div>
    </div>
  );
}

function ParamField({ p, value, onChange }: { p: ParamInfo; value: never; onChange: (v: unknown) => void }) {
  const id = `sim-param-${p.path.replace(/\./g, '-')}`;
  const title = `${p.help}${p.question ? ` (question ${p.question})` : ''}`;
  const def = p.kind === 'enum' ? p.values?.find((v) => v.value === p.default)?.label : String(p.default).replace('.', ',');
  if (p.kind === 'boolean') {
    return (
      <label className="inline small" title={title} style={{ alignSelf: 'end' }}>
        <input id={id} type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
        {p.label} {p.question ? <span className="muted mono">{p.question}</span> : null}
      </label>
    );
  }
  if (p.kind === 'enum') {
    return (
      <label className="field" htmlFor={id} title={title}>
        <span>
          {p.label} {p.question ? <span className="muted mono">{p.question}</span> : null}
        </span>
        <select id={id} value={value as string} onChange={(e) => onChange(e.target.value)}>
          {p.values!.map((v) => (
            <option key={v.value} value={v.value}>
              {v.label}
              {v.value === p.default ? ' (défaut)' : ''}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <label className="field" htmlFor={id} title={title}>
      <span>
        {p.label} {p.question ? <span className="muted mono">{p.question}</span> : null} : <span className="mono">{String(value).replace('.', ',')}</span>
        <span className="muted"> (défaut {def})</span>
      </span>
      <input id={id} type="range" min={p.min ?? 0} max={p.max ?? 1} step={p.step ?? 0.01} value={value as number} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}
