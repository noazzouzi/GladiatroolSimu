/**
 * Carte isométrique de l'arène (SVG) : 241 cases jouables, anneau des 96 cases de pics (texture métallique),
 * cases de départ, de cadeau, centre 300, case d'attente 152, obstacles ; combattants ; tracés d'actions (chemins,
 * zones de sort, poussées prévues, arrivées dans les pics) ; survol (id, coordonnées, infos) ; édition par
 * glisser-déposer ou clic sur une case.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cellCenter, diamondPoints, mapBounds, paintOrder, pickCell, polylinePoints } from '../model/iso.js';
import { fmtInt } from '../model/format.js';
import type { ActionVisual, CellInfo, MapFighter, MapInfo } from '../model/types.js';
import { Icon } from './Icon.js';
import { SPIKE_RING, Token, VulnBadge, Padlock, ShieldBadge } from './Token.js';

export interface OverlayGroup {
  actions: ActionVisual[];
  tone: 'plan' | 'monster';
  /** Numéro affiché de la première action. */
  startNumber: number;
  key: string;
}

export interface MapOverlay {
  groups: OverlayGroup[];
  /** Action mise en avant (``groupKey:index``) : les autres sont estompées. */
  focus?: string | null;
  /** Positions prévues (jetons fantômes). */
  ghosts?: { fighter: MapFighter; cell: number }[];
}

export interface MapViewProps {
  id: string;
  map: MapInfo;
  fighters: MapFighter[];
  gifts: readonly number[];
  markedCell?: number;
  overlay?: MapOverlay | null;
  editable?: boolean;
  selectedId?: number | null;
  animate?: boolean;
  onCellClick?: (cell: number) => void;
  onFighterClick?: (f: MapFighter) => void;
  onFighterDrop?: (f: MapFighter, cell: number) => void;
  ariaLabel: string;
  toolbarExtra?: React.ReactNode;
  defaultNumbers?: boolean;
}

const TOP_PAD = 34;

// ------------------------------------------------------------------ couche fixe (mémorisée)

const StaticLayer = memo(function StaticLayer({ map, showNumbers, coords }: { map: MapInfo; showNumbers: boolean; coords: boolean }) {
  const cells = useMemo(() => map.cells.slice().sort((a, b) => paintOrder(a.id, b.id)), [map]);
  return (
    <g>
      {/* épaisseur du plancher (planches de bois) */}
      {cells
        .filter((c) => c.playable)
        .map((c) => {
          const [x, y] = cellCenter(c.id);
          return <polygon key={`e${c.id}`} className="cell-edge" points={`${x - 43},${y} ${x},${y + 21.5} ${x + 43},${y} ${x + 43},${y + 7} ${x},${y + 28.5} ${x - 43},${y + 7}`} />;
        })}
      {cells.map((c) => (
        <CellShape key={c.id} c={c} waitCell={map.waitCell} />
      ))}
      {cells
        .filter((c) => c.start)
        .map((c) => (
          <polygon key={`s${c.id}`} className="cell-start" points={diamondPoints(c.id, 7)} />
        ))}
      {cells
        .filter((c) => c.gift && !c.spike)
        .map((c) => {
          const [x, y] = cellCenter(c.id);
          return <path key={`g${c.id}`} d={`M${x - 20},${y} L${x},${y + 10} L${x + 20},${y} L${x},${y - 10} Z`} fill="none" stroke="var(--gift)" strokeWidth={1.5} strokeDasharray="3 3" />;
        })}
      {(() => {
        const [x, y] = cellCenter(map.center);
        return (
          <g>
            <ellipse cx={x} cy={y} rx={24} ry={11} fill="none" stroke="var(--center)" strokeWidth={2.5} />
            <ellipse cx={x} cy={y} rx={12} ry={5.5} fill="none" stroke="var(--center)" strokeWidth={2} />
          </g>
        );
      })()}
      {showNumbers
        ? cells.map((c) => {
            const [x, y] = cellCenter(c.id);
            return (
              <text key={`n${c.id}`} className={`cell-num${c.spike ? ' on-spike' : ''}`} x={x} y={y + 1}>
                {coords ? `${c.x},${c.y}` : c.id}
              </text>
            );
          })
        : null}
    </g>
  );
});

function CellShape({ c, waitCell }: { c: CellInfo; waitCell: number }) {
  if (c.id === waitCell && !c.playable) {
    const [x, y] = cellCenter(c.id);
    return (
      <g>
        <polygon className="cell-wait" points={diamondPoints(c.id, 1)} />
        <text className="token-tag" x={x} y={y - 16} fill="var(--center)" style={{ fontSize: 10 }}>
          attente Mama
        </text>
      </g>
    );
  }
  if (c.obstacle) {
    const [x, y] = cellCenter(c.id);
    // caisse en bois (obstacle, bloque la ligne de vue)
    return (
      <g>
        <polygon points={`${x - 40},${y - 10} ${x},${y + 10} ${x},${y + 22} ${x - 40},${y + 2}`} fill="var(--obstacle)" />
        <polygon points={`${x + 40},${y - 10} ${x},${y + 10} ${x},${y + 22} ${x + 40},${y + 2}`} fill="var(--wood)" />
        <polygon className="cell-obstacle" points={`${x + 40},${y - 10} ${x},${y + 10} ${x - 40},${y - 10} ${x},${y - 30}`} />
      </g>
    );
  }
  if (c.spike) return <polygon className="cell-spike" points={diamondPoints(c.id, 0.5)} />;
  return <polygon className={`cell-floor${(c.x + c.y) % 2 ? ' alt' : ''}`} points={diamondPoints(c.id, 0.5)} />;
}

// ------------------------------------------------------------------ tracés

function toneColor(tone: OverlayGroup['tone']): string {
  return tone === 'monster' ? 'var(--monster-path)' : 'var(--path)';
}

function ActionOverlay({ a, number, tone, faded, markerId }: { a: ActionVisual; number: number; tone: OverlayGroup['tone']; faded: boolean; markerId: string }) {
  const color = toneColor(tone);
  const cls = faded ? 'ov-faded' : undefined;
  let anchor: number | undefined;
  const parts: React.ReactNode[] = [];
  if (a.zone && a.zone.length) {
    parts.push(
      <g key="z">
        {a.zone.map((c) => (
          <polygon key={c} className="ov-zone" points={diamondPoints(c, 3)} />
        ))}
      </g>,
    );
  }
  if (a.kind === 'move' && a.path && a.path.length > 1) {
    parts.push(<polyline key="p" className="ov-path" stroke={color} points={polylinePoints(a.path, 3)} markerEnd={`url(#${markerId}-${tone})`} />);
    anchor = a.path[a.path.length - 1];
  }
  if (a.kind === 'cast' && a.castCell !== undefined && a.castCell >= 0) {
    const [tx, ty] = cellCenter(a.castCell);
    if (a.from >= 0 && a.from !== a.castCell) {
      const [fx, fy] = cellCenter(a.from);
      parts.push(<line key="aim" className="ov-aim" stroke={color} x1={fx} y1={fy - 12} x2={tx} y2={ty} />);
    }
    parts.push(
      <g key="t" transform={`translate(${tx},${ty})`}>
        <ellipse rx={13} ry={6.5} fill="none" stroke={color} strokeWidth={2.5} />
        <path d="M-19,0 h8 M11,0 h8 M0,-10 v4 M0,6 v4" stroke={color} strokeWidth={2.5} />
      </g>,
    );
    anchor = a.castCell;
  }
  for (const [i, m] of a.forced.entries()) {
    if (m.path.length < 2 && m.from === m.to) continue;
    const pts = m.path.length >= 2 ? m.path : [m.from, m.to];
    parts.push(<polyline key={`f${i}`} className="ov-push" points={polylinePoints(pts, 6)} markerEnd={`url(#${markerId}-push)`} />);
    if (m.intoSpikes) {
      const [x, y] = cellCenter(m.to);
      parts.push(
        <g key={`fs${i}`}>
          <ellipse className="ov-spike-landing" cx={x} cy={y} rx={30} ry={15} />
          <ellipse className="ov-spike-landing" cx={x} cy={y} rx={34} ry={17} strokeDasharray="2 4" />
        </g>,
      );
    }
    if (m.collision) {
      const [x, y] = cellCenter(m.to);
      parts.push(<path key={`fc${i}`} d={`M${x - 6},${y - 20} l12,12 M${x + 6},${y - 20} l-12,12`} stroke="var(--push)" strokeWidth={3} strokeLinecap="round" />);
    }
  }
  if (anchor === undefined && a.kind === 'end' && a.from >= 0) anchor = a.from;
  return (
    <g className={cls}>
      {parts}
      {anchor !== undefined ? (
        <g transform={`translate(${cellCenter(anchor)[0] + 22},${cellCenter(anchor)[1] - 30})`}>
          <circle r={10} fill={color} stroke="var(--panel)" strokeWidth={2} />
          <text className="ov-badge-text" fill="var(--accent-ink)">
            {number}
          </text>
        </g>
      ) : null}
    </g>
  );
}

// ------------------------------------------------------------------ carte

export function MapView(props: MapViewProps) {
  const { map, fighters, gifts, overlay, editable, selectedId, onCellClick, onFighterClick, onFighterDrop } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number>(-1);
  // petits écrans : carte zoomée d'emblée (défilement dans son cadre, jamais de la page)
  const narrowScreen = typeof window !== 'undefined' && window.innerWidth < 640;
  const [zoom, setZoom] = useState(narrowScreen ? 2 : 1);
  const [showNumbers, setShowNumbers] = useState((props.defaultNumbers ?? false) && !narrowScreen);
  const [coords, setCoords] = useState(false);
  const [drag, setDrag] = useState<{ f: MapFighter; cell: number; moved: boolean } | null>(null);
  const markerId = `${props.id}-arrow`;
  const wrapRef = useRef<HTMLDivElement>(null);
  // zoom : recentre la vue sur l'arène
  useEffect(() => {
    const w = wrapRef.current;
    if (!w) return;
    const id = window.requestAnimationFrame(() => {
      w.scrollLeft = Math.max(0, (w.scrollWidth - w.clientWidth) / 2);
      w.scrollTop = Math.max(0, (w.scrollHeight - w.clientHeight) / 2);
    });
    return () => window.cancelAnimationFrame(id);
  }, [zoom]);

  const allCells = useMemo(() => map.cells.map((c) => c.id), [map]);
  const playable = useMemo(() => new Set(map.cells.filter((c) => c.playable).map((c) => c.id)), [map]);
  const cellById = useMemo(() => new Map(map.cells.map((c) => [c.id, c])), [map]);
  const b = useMemo(() => {
    const bb = mapBounds(allCells, 14);
    return { ...bb, y: bb.y - TOP_PAD, height: bb.height + TOP_PAD + 10 };
  }, [allCells]);

  const toSvg = useCallback((e: { clientX: number; clientY: number }): [number, number] | null => {
    const svg = svgRef.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(m.inverse());
    return [p.x, p.y];
  }, []);

  const cellAt = useCallback(
    (e: { clientX: number; clientY: number }): number => {
      const p = toSvg(e);
      if (!p) return -1;
      const c = pickCell(p[0], p[1]);
      return cellById.has(c) ? c : -1;
    },
    [toSvg, cellById],
  );

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const c = cellAt(e);
    if (c !== hover) setHover(c);
    if (drag) {
      const cell = playable.has(c) ? c : drag.cell;
      if (cell !== drag.cell || !drag.moved) setDrag({ ...drag, cell, moved: drag.moved || cell !== drag.f.cell });
    }
  };

  const onTokenDown = (e: React.PointerEvent<SVGGElement>, f: MapFighter) => {
    if (!editable || !onFighterDrop || f.waiting) return;
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    setDrag({ f, cell: f.cell, moved: false });
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drag) return;
    svgRef.current?.releasePointerCapture?.(e.pointerId);
    const d = drag;
    setDrag(null);
    if (d.moved && d.cell !== d.f.cell && playable.has(d.cell)) onFighterDrop?.(d.f, d.cell);
    else onFighterClick?.(d.f);
  };

  const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (drag) return;
    const target = e.target as Element;
    if (target.closest('.token')) return;
    const c = cellAt(e);
    if (c >= 0) onCellClick?.(c);
  };

  const sortedFighters = useMemo(
    () => fighters.filter((f) => f.alive && f.cell >= 0).sort((a, b) => paintOrder(a.cell, b.cell) || a.id - b.id),
    [fighters],
  );

  const hoverInfo = (() => {
    if (hover < 0) return null;
    const c = cellById.get(hover);
    if (!c) return null;
    const tags: string[] = [];
    if (c.spike) tags.push('pics');
    if (c.start) tags.push('case de départ');
    if (c.gift) tags.push('case de cadeau possible');
    if (c.id === map.center) tags.push('centre (arrivée de la Mama au T8)');
    if (c.id === map.waitCell) tags.push('attente de la Mama (hors combat, avant le T8)');
    if (c.obstacle) tags.push('obstacle (bloque la ligne de vue)');
    if (gifts.includes(c.id)) tags.push('cadeau posé');
    if (props.markedCell === c.id) tags.push('case marquée par l\'objectif');
    const occ = fighters.find((f) => f.alive && f.cell === c.id);
    return (
      <>
        <span className="mono">
          Case {c.id} — x {c.x}, y {c.y}
        </span>
        {tags.length ? <span> — {tags.join(', ')}</span> : null}
        {occ ? (
          <span>
            {' '}
            — <strong>{occ.name}</strong> ({occ.short}) : <span className="mono">{fmtInt(occ.hp)}</span> / <span className="mono">{fmtInt(occ.maxHp)}</span> PV
            {occ.vulnerable ? ', Vulnérable ×2' : ''}
            {occ.unshakable ? ', Inébranlable' : ''}
            {occ.invulnerable ? ', Invulnérable' : ''}
            {occ.inSpikes ? ', dans les pics' : ''}
          </span>
        ) : null}
      </>
    );
  })();

  const groups = overlay?.groups ?? [];
  const focus = overlay?.focus ?? null;

  return (
    <div>
      <div className="map-toolbar">
        <div className="seg" role="group" aria-label="Zoom de la carte">
          <button type="button" id={`${props.id}-zoom-moins`} className="btn btn-icon" onClick={() => setZoom((z) => Math.max(1, z - 0.5))} disabled={zoom <= 1} aria-label="Dézoomer">
            <Icon name="minus" />
          </button>
          <button type="button" id={`${props.id}-zoom-ajuster`} className="btn btn-icon" onClick={() => setZoom(1)} aria-label="Ajuster à la largeur">
            <Icon name="fit" />
          </button>
          <button type="button" id={`${props.id}-zoom-plus`} className="btn btn-icon" onClick={() => setZoom((z) => Math.min(3, z + 0.5))} disabled={zoom >= 3} aria-label="Zoomer">
            <Icon name="plus" />
          </button>
        </div>
        <label className="inline small">
          <input type="checkbox" id={`${props.id}-numeros`} checked={showNumbers} onChange={(e) => setShowNumbers(e.target.checked)} />
          Numéros de case
        </label>
        {showNumbers ? (
          <label className="inline small">
            <input type="checkbox" id={`${props.id}-coords`} checked={coords} onChange={(e) => setCoords(e.target.checked)} />
            Coordonnées (x, y)
          </label>
        ) : null}
        {props.toolbarExtra}
      </div>
      <div className={`map-wrap${drag ? ' dragging' : ''}`} ref={wrapRef}>
        <svg
          ref={svgRef}
          id={props.id}
          className={`map-svg${editable ? ' editable' : ''}`}
          viewBox={`${b.x} ${b.y} ${b.width} ${b.height}`}
          style={{ width: `${zoom * 100}%` }}
          role="img"
          aria-label={props.ariaLabel}
          onPointerMove={onPointerMove}
          onPointerLeave={() => !drag && setHover(-1)}
          onPointerUp={onPointerUp}
          onPointerCancel={() => setDrag(null)}
          onClick={onClick}
        >
          <defs>
            <pattern id="pat-spikes" width="14" height="10" patternUnits="userSpaceOnUse">
              <rect width="14" height="10" fill="var(--spike-bg)" />
              <path d="M0,10 L3.5,1 L7,10 Z" fill="var(--spike)" />
              <path d="M3.5,1 L7,10 L5,10 Z" fill="var(--spike-hi)" fillOpacity={0.55} />
              <path d="M7,10 L10.5,3 L14,10 Z" fill="var(--spike)" />
              <path d="M10.5,3 L14,10 L12,10 Z" fill="var(--spike-hi)" fillOpacity={0.55} />
            </pattern>
            {(['plan', 'monster', 'push'] as const).map((t) => (
              <marker key={t} id={`${markerId}-${t}`} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 Z" fill={t === 'push' ? 'var(--push)' : toneColor(t)} />
              </marker>
            ))}
          </defs>
          <StaticLayer map={map} showNumbers={showNumbers} coords={coords} />
          {props.markedCell !== undefined && props.markedCell >= 0 ? <polygon className="marked-cell" points={diamondPoints(props.markedCell, 4)} /> : null}
          {gifts.map((g) => {
            const [x, y] = cellCenter(g);
            return (
              <g key={`gift${g}`} transform={`translate(${x},${y - 6})`} aria-label={`cadeau sur ${g}`}>
                <rect x={-10} y={-8} width={20} height={16} rx={2} fill="var(--gift)" stroke="var(--token-edge)" strokeWidth={1.2} />
                <path d="M0,-8 V8 M-10,-2 H10" stroke="var(--panel)" strokeWidth={2.5} />
                <path d="M0,-8 C-4,-15 -9,-12 -5,-8 M0,-8 C4,-15 9,-12 5,-8" fill="none" stroke="var(--gift)" strokeWidth={2} />
              </g>
            );
          })}
          {hover >= 0 && playable.has(hover) ? <polygon className="hover-cell" points={diamondPoints(hover, 2)} /> : null}
          {groups.map((g) =>
            g.actions.map((a, i) => (
              <ActionOverlay key={`${g.key}:${i}`} a={a} number={g.startNumber + i} tone={g.tone} faded={focus !== null && focus !== `${g.key}:${i}`} markerId={markerId} />
            )),
          )}
          {drag && drag.moved ? <polygon className="drop-cell" points={diamondPoints(drag.cell, 2)} /> : null}
          {(overlay?.ghosts ?? []).map(({ fighter, cell }) => {
            const [x, y] = cellCenter(cell);
            return <Token key={`ghost${fighter.id}`} f={{ ...fighter, cell, current: false }} x={x} y={y} ghost />;
          })}
          {sortedFighters.map((f) => {
            const dragging = drag?.f.id === f.id && drag.moved;
            const [x, y] = cellCenter(dragging ? drag!.cell : f.cell);
            return (
              <Token
                key={f.id}
                f={f}
                x={x}
                y={y}
                selected={selectedId === f.id}
                animate={props.animate && !drag}
                onPointerDown={editable ? onTokenDown : undefined}
                onClick={!editable && onFighterClick ? onFighterClick : undefined}
              />
            );
          })}
        </svg>
      </div>
      <div className="map-info" aria-live="off">
        {hoverInfo ?? <span className="muted">Survolez une case pour voir son numéro, ses coordonnées et son occupant.{editable ? ' Glissez un jeton pour le déplacer.' : ''}</span>}
      </div>
    </div>
  );
}

/** Légende des symboles de la carte. */
export function MapLegend({ plan }: { plan?: boolean }) {
  return (
    <div className="legend" aria-label="Légende de la carte">
      <span>
        <svg width="26" height="14" viewBox="-43 -22 86 44" aria-hidden="true">
          <polygon points="43,0 0,21.5 -43,0 0,-21.5" fill="url(#pat-spikes)" stroke="var(--spike)" strokeWidth="2" />
        </svg>
        pics (×2 pour les monstres, 2 000 à l'entrée)
      </span>
      <span>
        <svg width="26" height="14" viewBox="-43 -22 86 44" aria-hidden="true">
          <polygon points="36,0 0,18 -36,0 0,-18" fill="none" stroke="var(--start)" strokeWidth="5" />
        </svg>
        case de départ
      </span>
      <span>
        <svg width="26" height="14" viewBox="-43 -22 86 44" aria-hidden="true">
          <path d="M-20,0 L0,10 L20,0 L0,-10 Z" fill="none" stroke="var(--gift)" strokeWidth="3" strokeDasharray="4 4" />
        </svg>
        case de cadeau
      </span>
      <span>
        <svg width="26" height="14" viewBox="-30 -15 60 30" aria-hidden="true">
          <ellipse rx="24" ry="11" fill="none" stroke="var(--center)" strokeWidth="3" />
        </svg>
        300 : arrivée de la Mama
      </span>
      <span>
        <svg width="22" height="16" viewBox="-12 -10 24 20" aria-hidden="true">
          <VulnBadge />
        </svg>
        Vulnérable (×2)
      </span>
      <span>
        <svg width="18" height="16" viewBox="-8 -9 16 18" aria-hidden="true">
          <Padlock />
        </svg>
        Inébranlable
      </span>
      <span>
        <svg width="18" height="18" viewBox="-9 -10 18 20" aria-hidden="true">
          <ShieldBadge />
        </svg>
        Invulnérable
      </span>
      <span>
        <svg width="34" height="16" viewBox="-32 -15 64 30" aria-hidden="true">
          <polygon points={SPIKE_RING} fill="var(--spike)" />
        </svg>
        dans les pics
      </span>
      {plan ? (
        <>
          <span>
            <svg width="30" height="10" viewBox="0 0 30 10" aria-hidden="true">
              <line x1="2" y1="5" x2="28" y2="5" stroke="var(--path)" strokeWidth="4" strokeLinecap="round" />
            </svg>
            déplacement
          </span>
          <span>
            <svg width="30" height="10" viewBox="0 0 30 10" aria-hidden="true">
              <line x1="2" y1="5" x2="28" y2="5" stroke="var(--push)" strokeWidth="4" strokeDasharray="7 4" />
            </svg>
            poussée / attirance prévue
          </span>
          <span>
            <svg width="30" height="14" viewBox="-15 -7 30 14" aria-hidden="true">
              <ellipse rx="13" ry="6" fill="none" stroke="var(--vuln)" strokeWidth="2.5" />
            </svg>
            arrivée dans les pics
          </span>
          <span>
            <svg width="30" height="14" viewBox="-15 -7 30 14" aria-hidden="true">
              <polygon points="14,0 0,7 -14,0 0,-7" fill="var(--zone)" fillOpacity="0.35" stroke="var(--zone)" />
            </svg>
            zone du sort
          </span>
          <span>
            <svg width="30" height="10" viewBox="0 0 30 10" aria-hidden="true">
              <line x1="2" y1="5" x2="28" y2="5" stroke="var(--monster-path)" strokeWidth="4" strokeLinecap="round" />
            </svg>
            actions des monstres
          </span>
        </>
      ) : null}
    </div>
  );
}
