/**
 * Écran « Carte & situation » : carte isométrique de l'état reconstruit par le runner (``buildSituation``) et
 * éditeur de la situation (joueurs, monstres, PV, états, tour, ordre de jeu, grimoires, objectifs, cadeaux),
 * import / export au format docs/FORMAT_SITUATION.md.
 */
import { useMemo, useState } from 'react';
import type { LoadState, Source } from '../App.js';
import { CopyBox, FighterList } from '../components/common.js';
import { Icon } from '../components/Icon.js';
import { MapLegend, MapView } from '../components/MapView.js';
import { TokenBadge } from '../components/Token.js';
import { fmtInt } from '../model/format.js';
import {
  addMonster,
  addPlayer,
  applyComposition,
  compoOf,
  currentIndex,
  exportSituation,
  moveFighter,
  occupantAt,
  parseSituationText,
  removeFighter,
  reorderPlayer,
  toggleGift,
  toggleState,
  updateMonster,
  updatePlayer,
  type FighterRef,
} from '../model/situationEdit.js';
import type { ArchetypeKey, Catalog, FighterView, MapFighter, Situation } from '../model/types.js';
import ex1 from '../../../sim/examples/t1_ouverture.json';
import ex3 from '../../../sim/examples/t3_dompteur_vulnerable.json';
import ex7 from '../../../sim/examples/t7_placement.json';
import ex8 from '../../../sim/examples/t8_mama.json';

const EXAMPLES: { id: string; label: string; sit: Situation }[] = [
  { id: 't1', label: 'T1 — ouverture ADDM (V1 sur 242 / 358)', sit: ex1 as Situation },
  { id: 't3', label: 'T3 — Dompteur, Troollibre Vulnérable dans les pics', sit: ex3 as Situation },
  { id: 't7', label: 'T7 — placement avant l\'arrivée de la Mama', sit: ex7 as Situation },
  { id: 't8', label: 'T8 — Mama arrivée', sit: ex8 as Situation },
];

type Tool = 'move' | 'troollibre' | 'artroolleur' | 'nitrooll' | 'gift' | 'delete';
const TOOLS: { id: Tool; label: string }[] = [
  { id: 'move', label: 'Sélection / déplacement' },
  { id: 'troollibre', label: '+ Troollibre' },
  { id: 'artroolleur', label: '+ Artroolleur' },
  { id: 'nitrooll', label: '+ Nitrooll' },
  { id: 'gift', label: 'Cadeau' },
  { id: 'delete', label: 'Supprimer' },
];

const STATE_LABEL = { vulnerable: 'Vulnérable', inebranlable: 'Inébranlable' } as const;

interface Props {
  catalog: Catalog;
  situation: Situation;
  source: Source;
  load: LoadState;
  onEdit: (s: Situation) => void;
  onGoPlan: () => void;
}

export function refOf(f: MapFighter): FighterRef | null {
  if (f.sitIndex === undefined) return null;
  return f.kind === 'player' ? { kind: 'player', index: f.sitIndex } : { kind: 'monster', index: f.sitIndex };
}

export function SituationScreen({ catalog, situation, source, load, onEdit, onGoPlan }: Props) {
  const [tool, setTool] = useState<Tool>('move');
  const [selected, setSelected] = useState<FighterRef | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const view = load.view;
  const fighters: FighterView[] = view?.fighters ?? [];
  const selectedId = useMemo(() => {
    if (!selected) return null;
    return fighters.find((f) => f.sitIndex === selected.index && (selected.kind === 'player') === (f.kind === 'player'))?.id ?? null;
  }, [selected, fighters]);

  const edit = (s: Situation, m: string | null = null) => {
    setMsg(m);
    onEdit(s);
  };

  const onCellClick = (cell: number) => {
    const cellInfo = catalog.map.cells.find((c) => c.id === cell);
    if (!cellInfo?.playable) return;
    if (tool === 'troollibre' || tool === 'artroolleur' || tool === 'nitrooll') {
      if (occupantAt(situation, cell)) return setMsg(`Case ${cell} occupée.`);
      edit(addMonster(situation, tool, cell), `${tool === 'troollibre' ? 'Troollibre' : tool === 'artroolleur' ? 'Artroolleur' : 'Nitrooll'} ajouté sur ${cell}.`);
      return;
    }
    if (tool === 'gift') {
      if (occupantAt(situation, cell)) return setMsg('Un cadeau se pose sur une case libre.');
      edit(toggleGift(situation, cell));
      return;
    }
    const occ = occupantAt(situation, cell);
    if (tool === 'delete') {
      if (occ) {
        edit(removeFighter(situation, occ));
        setSelected(null);
      } else if (situation.gifts?.includes(cell)) edit(toggleGift(situation, cell));
      return;
    }
    if (selected && !occ) {
      edit(moveFighter(situation, selected, cell));
      return;
    }
    setSelected(occ);
  };

  const onFighterDrop = (f: MapFighter, cell: number) => {
    const ref = refOf(f);
    if (!ref) return;
    edit(moveFighter(situation, ref, cell), `${f.name} → ${cell}${occupantAt(situation, cell) ? ' (échange)' : ''}.`);
    setSelected(ref);
  };

  const onFighterClick = (f: MapFighter) => {
    const ref = refOf(f);
    if (!ref) return;
    if (tool === 'delete') {
      edit(removeFighter(situation, ref));
      setSelected(null);
      return;
    }
    setSelected(ref);
  };

  const orderedFighters = useMemo(() => {
    const players = fighters.filter((f) => f.kind === 'player');
    const others = fighters.filter((f) => f.kind !== 'player');
    return [...players, ...others];
  }, [fighters]);

  return (
    <div className="split">
      <section className="panel" aria-labelledby="titre-carte">
        <div className="panel-title">
          <h2 id="titre-carte">Arène — carte {catalog.map.mapId}</h2>
          <span className="small muted">
            {view ? (
              <>
                Tour <span className="num">{view.turn}</span> — {view.status.text}
                {load.pending ? ' — reconstruction…' : ''}
              </>
            ) : (
              'reconstruction…'
            )}
          </span>
        </div>
        {source.kind === 'exact' ? (
          <div className="notice" style={{ marginBottom: 8 }}>
            État exact : {source.label}. Toute modification le convertit en situation décrite (les envoûtements autres que Vulnérable /
            Inébranlable et les relances sont alors perdus).
          </div>
        ) : null}
        <MapView
          id="carte-situation"
          map={catalog.map}
          fighters={fighters}
          gifts={view?.gifts ?? situation.gifts ?? []}
          markedCell={view?.objective?.markedCell}
          editable
          selectedId={selectedId}
          onCellClick={onCellClick}
          onFighterDrop={onFighterDrop}
          onFighterClick={onFighterClick}
          ariaLabel="Carte isométrique de l'arène du Gladiatrool avec les combattants"
          defaultNumbers
          toolbarExtra={
            <div className="seg" role="group" aria-label="Outil d'édition">
              {TOOLS.map((t) => (
                <button key={t.id} type="button" id={`outil-${t.id}`} className="btn btn-small" aria-pressed={tool === t.id} onClick={() => setTool(t.id)}>
                  {t.id === 'gift' ? <Icon name="gift" size={15} /> : t.id === 'delete' ? <Icon name="trash" size={15} /> : t.id === 'move' ? <Icon name="move" size={15} /> : null}
                  {t.label}
                </button>
              ))}
            </div>
          }
        />
        <p className="small muted" role="status">
          {msg ??
            (tool === 'move'
              ? 'Glissez un jeton vers une case (échange si elle est occupée), ou cliquez un jeton puis une case libre.'
              : tool === 'gift'
                ? 'Cliquez une case libre pour poser ou retirer un cadeau.'
                : tool === 'delete'
                  ? 'Cliquez un combattant ou un cadeau pour le retirer.'
                  : 'Cliquez une case libre pour y placer le monstre.')}
        </p>
        <MapLegend />
        {view ? (
          <div style={{ marginTop: 12 }}>
            <h4>Ordre de jeu du tour {view.turn}</h4>
            <div className="timeline-strip">
              {view.timeline.map((t) => (
                <span key={t.id} className={`chip${t.current ? ' current' : ''}`} title={t.name} style={t.alive ? undefined : { textDecoration: 'line-through' }}>
                  <span className="mono">{t.short}</span>
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <div className="stack">
        <section className="panel" aria-labelledby="titre-etat">
          <div className="panel-title">
            <h2 id="titre-etat">Combattants</h2>
            <button type="button" id="btn-aller-meilleur-tour" className="btn btn-primary" onClick={onGoPlan} disabled={!view || view.status.kind !== 'playerTurn'}>
              <Icon name="target" /> Trouver le meilleur tour
            </button>
          </div>
          {load.error ? (
            <div className="notice bad" role="alert" style={{ marginBottom: 8 }}>
              Situation invalide : {load.error}
            </div>
          ) : null}
          {load.warnings.length ? (
            <div className="notice warn" style={{ marginBottom: 8 }}>
              {load.warnings.map((w) => (
                <div key={w}>{w}</div>
              ))}
            </div>
          ) : null}
          {view?.objective ? (
            <p className="small">
              Objectif en cours : <strong>{view.objective.name}</strong> (palier {view.objective.tier}) — {view.objective.summary}
              {view.objective.designated ? ` — allié désigné : ${view.objective.designated}` : ''}
            </p>
          ) : (
            <p className="small muted">Aucun objectif en cours.</p>
          )}
          <FighterList
            fighters={orderedFighters}
            selectedId={selectedId}
            onSelect={(f) => {
              const r = refOf(f);
              if (r) setSelected(r);
            }}
          />
        </section>
        <Editor catalog={catalog} situation={situation} view={view} selected={selected} setSelected={setSelected} edit={edit} setTool={setTool} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ éditeur

function numOrUndef(v: string): number | undefined {
  if (v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : undefined;
}

function NumInput({ id, label, value, placeholder, min, max, onChange }: { id: string; label: string; value: number | undefined; placeholder?: string; min?: number; max?: number; onChange: (v: number | undefined) => void }) {
  return (
    <label className="field" htmlFor={id}>
      {label}
      <input id={id} type="number" inputMode="numeric" value={value ?? ''} placeholder={placeholder} min={min} max={max} onChange={(e) => onChange(numOrUndef(e.target.value))} />
    </label>
  );
}

interface EditorProps {
  catalog: Catalog;
  situation: Situation;
  view: LoadState['view'];
  selected: FighterRef | null;
  setSelected: (r: FighterRef | null) => void;
  edit: (s: Situation, msg?: string | null) => void;
  setTool: (t: Tool) => void;
}

function Editor({ catalog, situation, view, selected, setSelected, edit, setTool }: EditorProps) {
  const [compo, setCompo] = useState(compoOf(situation));
  const [compoErr, setCompoErr] = useState<string | null>(null);
  const [importText, setImportText] = useState('');
  const [importErr, setImportErr] = useState<string | null>(null);
  const cur = currentIndex(situation);
  const objectives = catalog.objectives;
  const completed = situation.objectives?.completed ?? [];
  const active = situation.objectives && 'active' in situation.objectives ? situation.objectives.active : undefined;
  const viewOf = (kind: 'player' | 'monster', index: number) => view?.fighters.find((f) => f.sitIndex === index && (kind === 'player') === (f.kind === 'player'));
  const arch = (k: ArchetypeKey) => catalog.archetypes.find((a) => a.key === k)!;

  const setObjectives = (o: Situation['objectives']) => edit({ ...situation, objectives: o });

  const doImport = (text: string) => {
    try {
      const s = parseSituationText(text);
      setImportErr(null);
      setCompo(compoOf(s));
      setSelected(null);
      edit(s, 'Situation importée.');
    } catch (e) {
      setImportErr((e as Error).message);
    }
  };

  return (
    <section className="panel" aria-labelledby="titre-editeur">
      <h2 id="titre-editeur">Éditeur de situation</h2>

      <details className="section" open>
        <summary>Combat</summary>
        <div className="grid-form">
          <NumInput id="sit-tour" label="Tour global" value={situation.turn} min={1} max={20} onChange={(v) => v !== undefined && v >= 1 && edit({ ...situation, turn: v })} />
          <NumInput id="sit-graine" label="Graine" value={situation.seed} placeholder="1" onChange={(v) => edit({ ...situation, seed: v })} />
          <label className="field" htmlFor="sit-courant">
            Personnage courant
            <select id="sit-courant" value={cur} onChange={(e) => edit({ ...situation, current: `J${Number(e.target.value) + 1}` })}>
              {situation.players.map((p, i) => (
                <option key={i} value={i} disabled={p.dead}>
                  J{i + 1} — {p.name ?? arch(p.archetype).name}
                </option>
              ))}
            </select>
          </label>
          <label className="field" htmlFor="sit-objectif">
            Objectif en cours
            <select
              id="sit-objectif"
              value={active === undefined ? '__auto' : active === null ? '__none' : active}
              onChange={(e) => {
                const v = e.target.value;
                setObjectives({ completed, ...(v === '__auto' ? {} : { active: v === '__none' ? null : (v as never) }) });
              }}
            >
              <option value="__auto">automatique</option>
              <option value="__none">aucun</option>
              {objectives.map((o) => (
                <option key={o.id} value={o.id}>
                  P{o.tier} — {o.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field" htmlFor="sit-description" style={{ marginTop: 8 }}>
          Description
          <input id="sit-description" type="text" value={situation.description ?? ''} onChange={(e) => edit({ ...situation, description: e.target.value || undefined })} />
        </label>
      </details>

      <details className="section" open>
        <summary>Joueurs (ordre de jeu)</summary>
        <div className="row" style={{ marginBottom: 8 }}>
          <label className="field" htmlFor="sit-compo" style={{ flex: '0 1 140px' }}>
            Composition
            <input id="sit-compo" type="text" value={compo} maxLength={4} onChange={(e) => setCompo(e.target.value.toUpperCase())} />
          </label>
          <button
            type="button"
            id="btn-appliquer-compo"
            className="btn btn-small"
            style={{ alignSelf: 'flex-end' }}
            onClick={() => {
              try {
                edit(applyComposition(situation, compo), `Composition ${compo} appliquée.`);
                setCompoErr(null);
              } catch (e) {
                setCompoErr((e as Error).message);
              }
            }}
          >
            Appliquer
          </button>
          {compoErr ? <span className="small" style={{ color: 'var(--bad)' }}>{compoErr}</span> : null}
        </div>
        {situation.players.map((p, i) => {
          const v = viewOf('player', i);
          const a = arch(p.archetype);
          const isSel = selected?.kind === 'player' && selected.index === i;
          return (
            <div key={i} className={`editor-row${isSel ? ' selected' : ''}`}>
              <div className="editor-row-head">
                <TokenBadge fighter={{ kind: 'player', archetype: p.archetype, short: `J${i + 1}`, playerIndex: i }} size={26} />
                <strong className="mono">J{i + 1}</strong>
                <select
                  id={`joueur-${i}-archetype`}
                  aria-label={`Archétype du joueur ${i + 1}`}
                  value={p.archetype}
                  onChange={(e) => edit(updatePlayer(situation, i, { archetype: e.target.value as ArchetypeKey, spells: undefined, upgrades: undefined, uniques: undefined, bonuses: undefined }))}
                >
                  {catalog.archetypes.map((x) => (
                    <option key={x.key} value={x.key}>
                      {x.name}
                    </option>
                  ))}
                </select>
                <span className="grow" />
                <button type="button" className="btn btn-icon btn-small" id={`joueur-${i}-monter`} aria-label="Monter dans l'ordre de jeu" disabled={i === 0} onClick={() => edit(reorderPlayer(situation, i, -1))}>
                  <Icon name="up" size={15} />
                </button>
                <button type="button" className="btn btn-icon btn-small" id={`joueur-${i}-descendre`} aria-label="Descendre dans l'ordre de jeu" disabled={i === situation.players.length - 1} onClick={() => edit(reorderPlayer(situation, i, 1))}>
                  <Icon name="down" size={15} />
                </button>
                <button type="button" className="btn btn-icon btn-small" id={`joueur-${i}-supprimer`} aria-label="Retirer ce joueur" disabled={situation.players.length <= 1} onClick={() => edit(removeFighter(situation, { kind: 'player', index: i }))}>
                  <Icon name="trash" size={15} />
                </button>
              </div>
              <div className="editor-fields">
                <NumInput id={`joueur-${i}-case`} label="Case" value={p.cell} placeholder="départ" onChange={(c) => edit(c === undefined ? updatePlayer(situation, i, { cell: undefined }) : moveFighter(situation, { kind: 'player', index: i }, c))} />
                <NumInput id={`joueur-${i}-pv`} label="PV" value={p.hp} placeholder={fmtInt(v?.maxHp ?? a.hp)} min={1} onChange={(hp) => edit(updatePlayer(situation, i, { hp }))} />
                {i === cur ? (
                  <>
                    <NumInput id={`joueur-${i}-pa`} label="PA restants" value={p.ap} placeholder={v ? String(v.maxAp) : ''} min={0} onChange={(ap) => edit(updatePlayer(situation, i, { ap }))} />
                    <NumInput id={`joueur-${i}-pm`} label="PM restants" value={p.mp} placeholder={v ? String(v.maxMp) : ''} min={0} onChange={(mp) => edit(updatePlayer(situation, i, { mp }))} />
                  </>
                ) : null}
              </div>
              <div className="row" style={{ marginTop: 6 }}>
                {(['vulnerable', 'inebranlable'] as const).map((s) => (
                  <label key={s} className="inline small">
                    <input type="checkbox" id={`joueur-${i}-${s}`} checked={!!p.states?.includes(s)} onChange={(e) => edit(updatePlayer(situation, i, { states: toggleState(p.states, s, e.target.checked) }))} />
                    {STATE_LABEL[s]}
                  </label>
                ))}
                <label className="inline small">
                  <input type="checkbox" id={`joueur-${i}-mort`} checked={!!p.dead} disabled={i === cur} onChange={(e) => edit(updatePlayer(situation, i, { dead: e.target.checked || undefined }))} />
                  Mort
                </label>
                <button type="button" className="btn btn-small" id={`joueur-${i}-selectionner`} onClick={() => { setSelected({ kind: 'player', index: i }); setTool('move'); }}>
                  Placer sur la carte
                </button>
              </div>
              <SpellEditor catalog={catalog} situation={situation} index={i} edit={edit} tiers={completed.length} />
            </div>
          );
        })}
        {situation.players.length < 4 ? (
          <div className="row" style={{ marginTop: 8 }}>
            {catalog.archetypes.map((a) => (
              <button key={a.key} type="button" className="btn btn-small" id={`ajouter-joueur-${a.key}`} onClick={() => edit(addPlayer(situation, a.key))}>
                <Icon name="plus" size={14} /> {a.name}
              </button>
            ))}
          </div>
        ) : null}
      </details>

      <details className="section" open>
        <summary>Monstres</summary>
        {situation.monsters.length === 0 ? <p className="small muted">Aucun monstre.</p> : null}
        {situation.monsters.map((m, i) => {
          const v = viewOf('monster', i);
          const info = catalog.monsters.find((x) => x.type === m.type)!;
          const isSel = selected?.kind === 'monster' && selected.index === i;
          const mama = m.type === 'mama';
          return (
            <div key={i} className={`editor-row${isSel ? ' selected' : ''}`}>
              <div className="editor-row-head">
                <TokenBadge fighter={{ kind: mama ? 'mama' : 'monster', monsterType: m.type, short: v?.short ?? info.short }} size={26} />
                {mama ? (
                  <strong>Mama Troollette</strong>
                ) : (
                  <select id={`monstre-${i}-type`} aria-label={`Type du monstre ${i + 1}`} value={m.type} onChange={(e) => edit(updateMonster(situation, i, { type: e.target.value as never }))}>
                    {catalog.monsters
                      .filter((x) => x.type !== 'mama')
                      .map((x) => (
                        <option key={x.type} value={x.type}>
                          {x.name}
                        </option>
                      ))}
                  </select>
                )}
                {v ? <span className="mono small muted">{v.short}</span> : null}
                <span className="grow" />
                <button type="button" className="btn btn-icon btn-small" id={`monstre-${i}-supprimer`} aria-label="Retirer ce monstre" onClick={() => edit(removeFighter(situation, { kind: 'monster', index: i }))}>
                  <Icon name="trash" size={15} />
                </button>
              </div>
              <div className="editor-fields">
                <NumInput
                  id={`monstre-${i}-case`}
                  label={mama && situation.turn < 8 ? 'Case (ignorée avant T8)' : 'Case'}
                  value={m.cell}
                  onChange={(c) => edit(c === undefined ? updateMonster(situation, i, { cell: undefined }) : moveFighter(situation, { kind: 'monster', index: i }, c))}
                />
                <NumInput id={`monstre-${i}-pv`} label="PV" value={m.hp} placeholder={fmtInt(v?.maxHp ?? info.hp)} min={1} onChange={(hp) => edit(updateMonster(situation, i, { hp }))} />
              </div>
              <div className="row" style={{ marginTop: 6 }}>
                {(['vulnerable', 'inebranlable'] as const).map((s) => (
                  <label key={s} className="inline small">
                    <input type="checkbox" id={`monstre-${i}-${s}`} checked={!!m.states?.includes(s)} onChange={(e) => edit(updateMonster(situation, i, { states: toggleState(m.states, s, e.target.checked) }))} />
                    {STATE_LABEL[s]}
                  </label>
                ))}
                {mama ? (
                  <label className="inline small">
                    <input type="checkbox" id={`monstre-${i}-morte`} checked={!!m.dead} onChange={(e) => edit(updateMonster(situation, i, { dead: e.target.checked || undefined }))} />
                    Morte
                  </label>
                ) : (
                  <button type="button" className="btn btn-small" id={`monstre-${i}-selectionner`} onClick={() => { setSelected({ kind: 'monster', index: i }); setTool('move'); }}>
                    Placer sur la carte
                  </button>
                )}
              </div>
            </div>
          );
        })}
        <div className="row" style={{ marginTop: 8 }}>
          {(['troollibre', 'artroolleur', 'nitrooll'] as const).map((t) => (
            <button key={t} type="button" className="btn btn-small" id={`ajouter-${t}`} onClick={() => setTool(t)}>
              <Icon name="plus" size={14} /> {catalog.monsters.find((x) => x.type === t)!.name} (cliquer une case)
            </button>
          ))}
          {!situation.monsters.some((m) => m.type === 'mama') ? (
            <button type="button" className="btn btn-small" id="ajouter-mama" onClick={() => edit({ ...situation, monsters: [...situation.monsters, { type: 'mama', ...(situation.turn >= 8 ? { cell: 300 } : {}) }] })}>
              <Icon name="plus" size={14} /> État de la Mama
            </button>
          ) : null}
        </div>
      </details>

      <details className="section">
        <summary>Objectifs réalisés ({completed.length})</summary>
        <ol className="small" style={{ paddingLeft: '1.3rem', margin: '4px 0' }}>
          {completed.map((id, k) => (
            <li key={`${id}${k}`}>
              {objectives.find((o) => o.id === id)?.name ?? id}{' '}
              <button type="button" className="btn btn-small" id={`objectif-${k}-retirer`} onClick={() => setObjectives({ ...situation.objectives, completed: completed.filter((_, j) => j !== k) })}>
                retirer
              </button>
            </li>
          ))}
        </ol>
        <label className="field" htmlFor="sit-ajout-objectif">
          Ajouter un objectif réalisé (dans l'ordre)
          <select
            id="sit-ajout-objectif"
            value=""
            onChange={(e) => {
              if (!e.target.value) return;
              setObjectives({ ...situation.objectives, completed: [...completed, e.target.value as never] });
            }}
          >
            <option value="">choisir…</option>
            {objectives
              .filter((o) => !completed.includes(o.id as never))
              .map((o) => (
                <option key={o.id} value={o.id}>
                  P{o.tier} — {o.name}
                </option>
              ))}
          </select>
        </label>
        <p className="small muted">Chaque objectif réalisé fait apprendre un sort à chaque joueur (ordre du Spell Manager) et retire 5 % à la Faveur de la Mama.</p>
      </details>

      <details className="section">
        <summary>Cadeaux ({situation.gifts?.length ?? 0})</summary>
        <div className="row">
          {(situation.gifts ?? []).map((g) => (
            <span key={g} className="chip mono">
              {g}
              <button type="button" className="btn btn-icon btn-small" aria-label={`Retirer le cadeau ${g}`} onClick={() => edit(toggleGift(situation, g))} style={{ minHeight: 20, minWidth: 20, padding: 0, border: 0 }}>
                <Icon name="x" size={12} />
              </button>
            </span>
          ))}
          <button type="button" className="btn btn-small" id="outil-cadeau-editeur" onClick={() => setTool('gift')}>
            <Icon name="gift" size={15} /> Poser sur la carte
          </button>
        </div>
      </details>

      <details className="section">
        <summary>Importer / exporter</summary>
        <div className="stack">
          <label className="field" htmlFor="sit-exemple">
            Exemples (sim/examples)
            <select
              id="sit-exemple"
              value=""
              onChange={(e) => {
                const ex = EXAMPLES.find((x) => x.id === e.target.value);
                if (ex) {
                  setCompo(compoOf(ex.sit));
                  setSelected(null);
                  edit(structuredClone(ex.sit), `Exemple chargé : ${ex.label}.`);
                }
              }}
            >
              <option value="">choisir un exemple…</option>
              {EXAMPLES.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field" htmlFor="sit-import-texte">
            Coller une situation (JSON)
            <textarea id="sit-import-texte" rows={5} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder='{ "version": 1, "turn": 3, "players": [...], "monsters": [...] }' />
          </label>
          <div className="row">
            <button type="button" className="btn btn-small" id="btn-importer-texte" disabled={!importText.trim()} onClick={() => doImport(importText)}>
              <Icon name="upload" size={15} /> Charger le texte
            </button>
            <label className="btn btn-small" htmlFor="sit-import-fichier">
              <Icon name="upload" size={15} /> Ouvrir un fichier…
            </label>
            <input
              id="sit-import-fichier"
              className="sr-only"
              type="file"
              accept=".json,application/json"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) doImport(await file.text());
                e.target.value = '';
              }}
            />
          </div>
          {importErr ? (
            <div className="notice bad" role="alert">
              {importErr}
            </div>
          ) : null}
          <CopyBox id="sit-export" label="Situation actuelle (format docs/FORMAT_SITUATION.md)" text={exportSituation(situation)} rows={10} />
        </div>
      </details>
    </section>
  );
}

// ------------------------------------------------------------------ grimoire, améliorations, uniques, Acclamations

function SpellEditor({ catalog, situation, index, edit, tiers }: { catalog: Catalog; situation: Situation; index: number; edit: (s: Situation) => void; tiers: number }) {
  const p = situation.players[index]!;
  const a = catalog.archetypes.find((x) => x.key === p.archetype)!;
  const auto = a.slots.filter((s) => s.unlock === 'common' || s.unlock === 'start' || (/^tier(\d)$/.test(s.unlock) && Number(s.unlock.slice(4)) <= tiers)).map((s) => s.id);
  const spells = p.spells ?? auto;
  const upgrades = p.upgrades ?? [];
  const uniques = p.uniques ?? [];
  const bonuses = p.bonuses ?? {};
  const set = (patch: Partial<typeof p>) => edit(updatePlayer(situation, index, patch));
  const toggle = (list: number[], id: number, on: boolean) => (on ? [...new Set([...list, id])] : list.filter((x) => x !== id));
  const bonusCount = Object.values(bonuses).reduce((s, n) => s + n, 0);
  return (
    <details style={{ marginTop: 6 }}>
      <summary className="small" style={{ cursor: 'pointer' }}>
        Sorts ({spells.length}), améliorations ({upgrades.length}), uniques ({uniques.length}), Acclamations ({bonusCount})
      </summary>
      <label className="inline small" style={{ marginTop: 6 }}>
        <input type="checkbox" id={`joueur-${index}-grimoire-auto`} checked={p.spells === undefined} onChange={(e) => set({ spells: e.target.checked ? undefined : auto })} />
        Grimoire automatique (sort commun, sort de départ, un sort par objectif réalisé)
      </label>
      <div className="spell-grid">
        {a.slots.map((s) => (
          <label key={s.id} className="inline small">
            <input type="checkbox" id={`joueur-${index}-sort-${s.id}`} disabled={p.spells === undefined} checked={spells.includes(s.id)} onChange={(e) => set({ spells: toggle(spells, s.id, e.target.checked) })} />
            {s.name} <span className="muted mono">{s.ap} PA</span>
          </label>
        ))}
      </div>
      <h4 style={{ marginTop: 8 }}>Améliorés (cartes « Amélioration »)</h4>
      <div className="spell-grid">
        {a.upgrades
          .filter((u) => spells.includes(u.base))
          .map((u) => (
            <label key={u.base} className="inline small">
              <input type="checkbox" id={`joueur-${index}-amelioration-${u.base}`} checked={upgrades.includes(u.base)} onChange={(e) => set({ upgrades: toggle(upgrades, u.base, e.target.checked) })} />
              {u.name}
            </label>
          ))}
      </div>
      <h4 style={{ marginTop: 8 }}>Sorts uniques possédés</h4>
      <div className="spell-grid">
        {a.uniques.map((u) => (
          <label key={u.id} className="inline small">
            <input type="checkbox" id={`joueur-${index}-unique-${u.id}`} checked={uniques.includes(u.id)} onChange={(e) => set({ uniques: toggle(uniques, u.id, e.target.checked) })} />
            {u.name}
          </label>
        ))}
      </div>
      <h4 style={{ marginTop: 8 }}>Acclamations reçues (nombre de cartes)</h4>
      <div className="editor-fields">
        {a.acclamations.map((c) => (
          <NumInput
            key={c.stat}
            id={`joueur-${index}-bonus-${c.stat}`}
            label={c.name.replace(/^Acclamation /, '')}
            value={bonuses[c.stat]}
            placeholder="0"
            min={0}
            max={8}
            onChange={(n) => {
              const next = { ...bonuses };
              if (!n) delete next[c.stat];
              else next[c.stat] = Math.max(0, n);
              set({ bonuses: Object.keys(next).length ? next : undefined });
            }}
          />
        ))}
      </div>
    </details>
  );
}
