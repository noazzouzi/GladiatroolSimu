/**
 * Écran « Meilleur tour » : planificateur (mode deep par défaut, dans le worker) sur l'état courant — plan du
 * personnage courant et du tour global de l'équipe, étapes numérotées tracées sur la carte, explications, 3 à 5
 * alternatives comparables ; « Appliquer » joue le plan et montre l'état atteint et le passage des monstres.
 */
import { useMemo, useState } from 'react';
import type { LoadState, Source } from '../App.js';
import { FighterList } from '../components/common.js';
import { Icon } from '../components/Icon.js';
import { MapLegend, MapView, type MapOverlay, type OverlayGroup } from '../components/MapView.js';
import { ReplayViewer } from '../components/ReplayViewer.js';
import { fmtInt, fmtMs, fmtSigned } from '../model/format.js';
import type { ActionVisual, ApplyResult, BestTurnResult, Catalog, MapFighter, PlanCard, PlannerMode } from '../model/types.js';

interface Props {
  catalog: Catalog;
  load: LoadState;
  source: Source;
  best: BestTurnResult | null;
  applied: ApplyResult | null;
  busy: boolean;
  progress: React.ReactNode;
  onPlan: (mode: PlannerMode, team: boolean) => void;
  onApply: (source: 'best' | 'alt' | 'team', index: number, rolls: 'average' | 'random', wholeTeam: boolean) => void;
  onCloseApplied: () => void;
  onEditSituation: () => void;
}

type Selection = { kind: 'best' } | { kind: 'alt'; index: number } | { kind: 'team' };

function effects(a: ActionVisual): string[] {
  const out: string[] = [];
  if (a.damage.length) out.push(a.damage.map((d) => `${d.name} −${fmtInt(d.amount)} PV${d.killed ? ' (mort)' : ''}`).join(' ; '));
  for (const m of a.forced) out.push(`${m.name} ${m.kind === 'pull' ? 'attiré' : m.kind === 'swap' ? 'échangé' : m.kind === 'advance' ? 'avance' : 'poussé'} ${m.from} → ${m.to}${m.intoSpikes ? ' — DANS LES PICS' : ''}${m.collision ? ' (collision)' : ''}`);
  if (a.enteredSpikes.length && !a.forced.some((m) => m.intoSpikes)) out.push(`entre dans les pics : ${a.enteredSpikes.join(', ')}`);
  if (a.deaths.length && !a.damage.some((d) => d.killed)) out.push(`morts : ${a.deaths.join(', ')}`);
  return out;
}

function StepList({ steps, start, tone, focus, setFocus, groupKey }: { steps: ActionVisual[]; start: number; tone: 'plan' | 'monster'; focus: string | null; setFocus: (k: string | null) => void; groupKey: string }) {
  return (
    <ol className="plan-steps">
      {steps.map((a, i) => {
        const key = `${groupKey}:${i}`;
        const eff = effects(a);
        return (
          <li
            key={key}
            className={`plan-step${tone === 'monster' ? ' monster' : ''}${focus === key ? ' focus' : ''}`}
            onMouseEnter={() => setFocus(key)}
            onMouseLeave={() => setFocus(null)}
            onFocus={() => setFocus(key)}
            onBlur={() => setFocus(null)}
            tabIndex={0}
          >
            <span className="badge" aria-hidden="true">
              {start + i}
            </span>
            <div>
              <div>{a.kind === 'end' ? a.label : a.label.replace(`${a.actorName} : `, tone === 'monster' ? `${a.actorName} : ` : '')}</div>
              {eff.length ? <div className="effects">{eff.join(' — ')}</div> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function summaryChips(c: PlanCard) {
  const s = c.summary;
  return (
    <div className="row" style={{ gap: 4 }}>
      <span className="chip">
        dégâts <span className="mono">{fmtInt(s.damageDealt)}</span>
      </span>
      {s.enteredSpikes.length ? <span className="chip chip-spike">pics : {s.enteredSpikes.join(', ')}</span> : null}
      {s.kills.length ? <span className="chip chip-vuln">morts : {s.kills.join(', ')}</span> : null}
      {s.objectivesCompleted.length ? <span className="chip on">objectif : {s.objectivesCompleted.join(', ')}</span> : null}
      {s.giftTaken ? <span className="chip">cadeau ramassé</span> : null}
      <span className="chip mono">fin sur {s.finalCell}</span>
      {s.risks.length ? <span className="chip chip-unshak">{s.risks.length} risque(s)</span> : null}
    </div>
  );
}

export function BestTurnScreen({ catalog, load, source, best, applied, busy, progress, onPlan, onApply, onCloseApplied, onEditSituation }: Props) {
  const [mode, setMode] = useState<PlannerMode>('deep');
  const [team, setTeam] = useState(true);
  const [sel, setSel] = useState<Selection>({ kind: 'best' });
  const [focus, setFocus] = useState<string | null>(null);
  const [showMonsters, setShowMonsters] = useState(true);
  const [rolls, setRolls] = useState<'average' | 'random'>('average');
  const view = load.view;
  const canPlan = !!view && view.status.kind === 'playerTurn' && !busy && !load.pending && !load.error;

  const card: PlanCard | null = best ? (sel.kind === 'best' ? best.best : sel.kind === 'alt' ? best.alternatives[sel.index] ?? best.best : null) : null;

  const overlay: MapOverlay | null = useMemo(() => {
    if (!best || !view) return null;
    const byId = new Map(view.fighters.map((f) => [f.id, f]));
    const ghost = (c: PlanCard): MapOverlay['ghosts'] => {
      const f = byId.get(c.actorId);
      const end = c.summary.finalCell;
      return f && end >= 0 && end !== f.cell ? [{ fighter: f as MapFighter, cell: end }] : [];
    };
    if (sel.kind === 'team' && best.team) {
      const groups: OverlayGroup[] = [];
      let n = 1;
      const ghosts: NonNullable<MapOverlay['ghosts']> = [];
      best.team.steps.forEach((c, k) => {
        groups.push({ actions: c.steps, tone: 'plan', startNumber: n, key: `t${k}` });
        n += c.steps.length;
        if (showMonsters && c.interlude.length) {
          groups.push({ actions: c.interlude, tone: 'monster', startNumber: n, key: `m${k}` });
          n += c.interlude.length;
        }
        ghosts.push(...(ghost(c) ?? []));
      });
      return { groups, focus, ghosts };
    }
    if (!card) return null;
    const groups: OverlayGroup[] = [{ actions: card.steps, tone: 'plan', startNumber: 1, key: 'p' }];
    if (showMonsters && card.interlude.length) groups.push({ actions: card.interlude, tone: 'monster', startNumber: card.steps.length + 1, key: 'm' });
    return { groups, focus, ghosts: ghost(card) };
  }, [best, view, sel, card, focus, showMonsters]);

  if (applied) {
    return (
      <div className="stack">
        <div className="notice ok row-between">
          <span>{applied.message}</span>
          <span className="row">
            <button type="button" className="btn btn-primary" id="btn-planifier-suivant" onClick={() => { onCloseApplied(); onPlan(mode, team); }} disabled={busy || applied.view.status.kind !== 'playerTurn'}>
              <Icon name="target" /> Planifier le joueur suivant
            </button>
            <button type="button" className="btn" id="btn-fermer-rejeu-plan" onClick={onCloseApplied}>
              Voir l'état atteint
            </button>
          </span>
        </div>
        <ReplayViewer id="rejeu-plan" catalog={catalog} replay={applied.replay} initialFrame={0} header={<h2>Plan appliqué : actions et passage des monstres</h2>} />
      </div>
    );
  }

  const fighters = view?.fighters ?? [];
  const ordered = [...fighters.filter((f) => f.kind === 'player'), ...fighters.filter((f) => f.kind !== 'player' && f.alive)];

  return (
    <div className="split">
      <section className="panel" aria-labelledby="titre-carte-plan">
        <div className="panel-title">
          <h2 id="titre-carte-plan">Tour {view?.turn ?? '…'} — {view?.status.text ?? 'chargement'}</h2>
          <button type="button" className="btn btn-small" id="btn-modifier-situation" onClick={onEditSituation}>
            Modifier la situation
          </button>
        </div>
        {source.kind === 'exact' ? <div className="notice" style={{ marginBottom: 8 }}>État exact : {source.label}</div> : null}
        {load.error ? <div className="notice bad">Situation invalide : {load.error}</div> : null}
        <MapView
          id="carte-plan"
          map={catalog.map}
          fighters={fighters}
          gifts={view?.gifts ?? []}
          markedCell={view?.objective?.markedCell}
          overlay={overlay}
          ariaLabel="Carte avec le plan proposé : chemins, zones de sort, poussées et arrivées dans les pics"
          toolbarExtra={
            best ? (
              <label className="inline small">
                <input type="checkbox" id="plan-montrer-monstres" checked={showMonsters} onChange={(e) => setShowMonsters(e.target.checked)} />
                Passage des monstres (prévu)
              </label>
            ) : null
          }
        />
        <MapLegend plan />
        {view?.objective ? (
          <p className="small" style={{ marginTop: 8 }}>
            Objectif en cours : <strong>{view.objective.name}</strong> — {view.objective.summary}
          </p>
        ) : null}
        <details className="section">
          <summary>Combattants ({ordered.length})</summary>
          <FighterList fighters={ordered} />
        </details>
      </section>

      <div className="stack">
        <section className="panel" aria-labelledby="titre-recherche">
          <h2 id="titre-recherche">Recherche</h2>
          <div className="row">
            <label className="field" htmlFor="plan-mode">
              Profondeur
              <select id="plan-mode" value={mode} onChange={(e) => setMode(e.target.value as PlannerMode)}>
                <option value="deep">approfondie (deep, ≈ 1 à 5 s)</option>
                <option value="fast">rapide (fast, ≈ 0,3 s)</option>
                <option value="greedy">gloutonne (greedy)</option>
              </select>
            </label>
            <label className="inline small" style={{ alignSelf: 'flex-end', paddingBottom: 6 }}>
              <input type="checkbox" id="plan-equipe" checked={team} onChange={(e) => setTeam(e.target.checked)} />
              Plan d'équipe (tour global)
            </label>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button type="button" className="btn btn-primary" id="btn-meilleur-tour" disabled={!canPlan} onClick={() => { setSel({ kind: 'best' }); onPlan(mode, team); }}>
              <Icon name="target" /> Trouver le meilleur tour
            </button>
            {view && view.status.kind !== 'playerTurn' ? <span className="small muted">Ce n'est pas le tour d'un joueur.</span> : null}
          </div>
          {progress ? <div style={{ marginTop: 10 }}>{progress}</div> : null}
          {best ? (
            <p className="small muted" style={{ marginTop: 8 }}>
              {fmtMs(best.timeMs)} — {fmtInt(best.stats.nodes)} nœuds, {fmtInt(best.stats.simulations)} simulations, {best.stats.lookaheads} anticipations
              {best.stats.truncated ? ' (plafond de temps atteint)' : ''}. Jets moyens, sans critique.
            </p>
          ) : null}
        </section>

        {best ? (
          <section className="panel" aria-labelledby="titre-plan">
            <div className="seg" role="tablist" aria-label="Plan affiché" style={{ marginBottom: 10 }}>
              <button type="button" role="tab" id="plan-vue-courant" className="btn btn-small" aria-selected={sel.kind !== 'team'} aria-pressed={sel.kind !== 'team'} onClick={() => setSel({ kind: 'best' })}>
                {best.actorName} (courant)
              </button>
              <button type="button" role="tab" id="plan-vue-equipe" className="btn btn-small" aria-selected={sel.kind === 'team'} aria-pressed={sel.kind === 'team'} disabled={!best.team} onClick={() => setSel({ kind: 'team' })}>
                Équipe — tour global {best.turn}
              </button>
            </div>
            {sel.kind !== 'team' && card ? (
              <>
                <h2 id="titre-plan">
                  {card.title} — {card.actorName}
                </h2>
                {summaryChips(card)}
                <h4 style={{ marginTop: 10 }}>Étapes</h4>
                <StepList steps={card.steps} start={1} tone="plan" focus={focus} setFocus={setFocus} groupKey="p" />
                {showMonsters && card.interlude.length ? (
                  <>
                    <h4 style={{ marginTop: 10 }}>Ensuite (prévu, jets moyens)</h4>
                    <StepList steps={card.interlude} start={card.steps.length + 1} tone="monster" focus={focus} setFocus={setFocus} groupKey="m" />
                  </>
                ) : null}
                <h4 style={{ marginTop: 10 }}>Explication</h4>
                <pre className="explain">{card.explanation.join('\n')}</pre>
                {card.summary.risks.length ? (
                  <div className="notice warn" style={{ marginTop: 8 }}>
                    <strong>Risques</strong>
                    <ul style={{ margin: '4px 0 0', paddingLeft: '1.2rem' }}>
                      {card.summary.risks.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            ) : null}
            {sel.kind === 'team' && best.team ? (
              <>
                <h2 id="titre-plan">Plan du tour global {best.turn}</h2>
                <pre className="explain">{best.team.explanation.join('\n')}</pre>
                {(() => {
                  let n = 1;
                  return best.team.steps.map((c, k) => {
                    const start = n;
                    n += c.steps.length;
                    const mStart = n;
                    if (showMonsters) n += c.interlude.length;
                    return (
                      <div key={c.key} style={{ marginTop: 10 }}>
                        <h3>{c.actorName}</h3>
                        {summaryChips(c)}
                        <StepList steps={c.steps} start={start} tone="plan" focus={focus} setFocus={setFocus} groupKey={`t${k}`} />
                        {showMonsters && c.interlude.length ? <StepList steps={c.interlude} start={mStart} tone="monster" focus={focus} setFocus={setFocus} groupKey={`m${k}`} /> : null}
                        <details>
                          <summary className="small" style={{ cursor: 'pointer' }}>
                            Explication
                          </summary>
                          <pre className="explain">{c.explanation.join('\n')}</pre>
                        </details>
                      </div>
                    );
                  });
                })()}
              </>
            ) : null}
            <div className="row" style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
              <label className="field" htmlFor="plan-jets">
                Jets à l'application
                <select id="plan-jets" value={rolls} onChange={(e) => setRolls(e.target.value as 'average' | 'random')}>
                  <option value="average">moyens (comme le plan)</option>
                  <option value="random">aléatoires (graine du combat)</option>
                </select>
              </label>
              {sel.kind === 'team' ? (
                <button type="button" className="btn btn-stripe" id="btn-appliquer-equipe" disabled={busy} style={{ alignSelf: 'flex-end' }} onClick={() => onApply('team', 0, rolls, true)}>
                  <Icon name="check" /> Appliquer tout le tour global
                </button>
              ) : (
                <button type="button" className="btn btn-stripe" id="btn-appliquer-plan" disabled={busy} style={{ alignSelf: 'flex-end' }} onClick={() => onApply(sel.kind === 'alt' ? 'alt' : 'best', sel.kind === 'alt' ? sel.index : 0, rolls, false)}>
                  <Icon name="check" /> Appliquer {sel.kind === 'alt' ? `l'alternative ${sel.index + 1}` : 'ce plan'}
                </button>
              )}
            </div>
          </section>
        ) : null}

        {best && best.alternatives.length ? (
          <section className="panel" aria-labelledby="titre-alternatives">
            <h2 id="titre-alternatives">Alternatives ({best.alternatives.length})</h2>
            <p className="small muted">Autres suites de lancers, classées par score (PV équivalents après anticipation). Cliquez une ligne pour la tracer.</p>
            <div className="table-wrap">
              <table className="alt-table">
                <thead>
                  <tr>
                    <th scope="col">Plan</th>
                    <th scope="col" className="num">
                      Score (écart)
                    </th>
                    <th scope="col" className="num">
                      Dégâts
                    </th>
                    <th scope="col">Pics / morts</th>
                    <th scope="col" className="num">
                      Fin
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[best.best, ...best.alternatives].map((c, i) => {
                    const chosen = (i === 0 && sel.kind === 'best') || (sel.kind === 'alt' && sel.index === i - 1);
                    const casts = c.steps.filter((s) => s.kind === 'cast').map((s) => s.spellName);
                    return (
                      <tr
                        key={c.key}
                        className={chosen ? 'chosen' : undefined}
                        tabIndex={0}
                        onClick={() => setSel(i === 0 ? { kind: 'best' } : { kind: 'alt', index: i - 1 })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSel(i === 0 ? { kind: 'best' } : { kind: 'alt', index: i - 1 });
                          }
                        }}
                        aria-selected={chosen}
                      >
                        <td>
                          <strong>{i === 0 ? 'Meilleur' : `Alt. ${i}`}</strong>
                          <div className="small muted">{casts.length ? casts.join(', ') : 'aucun sort'}</div>
                        </td>
                        <td className="num mono">
                          {fmtInt(c.score)}
                          {i > 0 ? <div className="small muted">{fmtSigned(c.score - best.best.score, 0)}</div> : null}
                        </td>
                        <td className="num mono">{fmtInt(c.summary.damageDealt)}</td>
                        <td className="small">
                          {c.summary.enteredSpikes.length ? `pics : ${c.summary.enteredSpikes.join(', ')}` : '—'}
                          {c.summary.kills.length ? <div>morts : {c.summary.kills.join(', ')}</div> : null}
                        </td>
                        <td className="num mono">{c.summary.finalCell}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
