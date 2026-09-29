/**
 * Jetons des combattants dessinés en SVG : une forme par archétype / type de monstre (lisible sans la couleur),
 * initiales, barre de PV, marqueurs Vulnérable (×2), Inébranlable (cadenas), Invulnérable (bouclier), dans les pics
 * (couronne de pointes au sol).
 */
import { memo } from 'react';
import type { MapFighter } from '../model/types.js';

function polygon(n: number, r: number, rot = 0): string {
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i * 2 * Math.PI) / n;
    pts.push(`${(r * Math.cos(a)).toFixed(1)},${(r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}

const HEX = polygon(6, 16.5, 0);
const OCT = polygon(8, 17, Math.PI / 8);
const PENTA = polygon(5, 17.5, -Math.PI / 2);
const DIAMOND = '0,-18 17,0 0,18 -17,0';
const CROWN = '-22,12 -22,-6 -13,2 -6,-14 0,-4 6,-14 13,2 22,-6 22,12';
const SPIKE_RING = (() => {
  const pts: string[] = [];
  const n = 18;
  for (let i = 0; i < n * 2; i++) {
    const a = (i * Math.PI) / n;
    const k = i % 2 === 0 ? 1.28 : 1;
    pts.push(`${(24 * k * Math.cos(a)).toFixed(1)},${(11 * k * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
})();

const LETTER: Record<string, string> = { acrobate: 'A', dompteur: 'D', magicien: 'M' };

export function fighterColors(f: Pick<MapFighter, 'kind'>): { fill: string; ink: string } {
  switch (f.kind) {
    case 'player':
      return { fill: 'var(--player)', ink: 'var(--player-ink)' };
    case 'mama':
      return { fill: 'var(--mama)', ink: 'var(--mama-ink)' };
    case 'summon':
      return { fill: 'var(--summon)', ink: 'var(--troll-ink)' };
    default:
      return { fill: 'var(--troll)', ink: 'var(--troll-ink)' };
  }
}

/** Forme de base du jeton (centrée en 0,0). */
export function TokenBody({ f }: { f: Pick<MapFighter, 'kind' | 'archetype' | 'monsterType' | 'short' | 'playerIndex'> }) {
  const { fill, ink } = fighterColors(f);
  const common = { fill, stroke: 'var(--token-edge)', strokeWidth: 2 };
  let shape;
  let label = f.short;
  if (f.kind === 'player') {
    label = LETTER[f.archetype ?? ''] ?? '?';
    if (f.archetype === 'dompteur') shape = <rect x={-15} y={-15} width={30} height={30} rx={7} {...common} />;
    else if (f.archetype === 'magicien') shape = <polygon points={HEX} {...common} />;
    else shape = <circle r={16} {...common} />;
  } else if (f.kind === 'mama') shape = <polygon points={CROWN} {...common} strokeLinejoin="round" />;
  else if (f.kind === 'summon') shape = <circle r={11} {...common} />;
  else if (f.monsterType === 'artroolleur') shape = <polygon points={PENTA} {...common} strokeLinejoin="round" />;
  else if (f.monsterType === 'nitrooll') shape = <polygon points={DIAMOND} {...common} strokeLinejoin="round" />;
  else shape = <polygon points={OCT} {...common} strokeLinejoin="round" />;
  return (
    <>
      {shape}
      {/* reflet discret du haut du jeton */}
      <path d={f.kind === 'mama' ? 'M-18,-3 L-13,4' : 'M-9,-11 Q0,-15 9,-11'} fill="none" stroke={ink} strokeOpacity={0.35} strokeWidth={2} strokeLinecap="round" />
      <text className="token-label" y={f.kind === 'mama' ? 4 : 1} fill={ink} style={{ fontSize: f.kind === 'mama' ? 12 : label.length > 2 ? 11 : 14 }}>
        {label}
      </text>
      {f.kind === 'player' && f.playerIndex !== undefined ? (
        <g transform="translate(-15,-15)">
          <circle r={7.5} fill="var(--panel)" stroke="var(--token-edge)" strokeWidth={1.5} />
          <text className="token-tag" fill="var(--ink)">
            {f.playerIndex + 1}
          </text>
        </g>
      ) : null}
    </>
  );
}

function Padlock() {
  return (
    <g>
      <rect x={-6} y={-7} width={12} height={12} rx={2.5} fill="var(--unshak)" stroke="var(--token-edge)" strokeWidth={1.2} />
      <path d="M-3,-2 v-3 a3,3 0 0 1 6,0 v3" fill="none" stroke="var(--panel)" strokeWidth={1.6} />
      <circle cy={1.5} r={1.4} fill="var(--panel)" />
    </g>
  );
}

function ShieldBadge() {
  return <path d="M0,-8 L7,-5 V1 C7,5 3.5,7.5 0,9 C-3.5,7.5 -7,5 -7,1 V-5 Z" fill="var(--invul)" stroke="var(--token-edge)" strokeWidth={1.2} />;
}

function VulnBadge() {
  return (
    <g>
      <circle r={8.5} fill="var(--vuln)" stroke="var(--token-edge)" strokeWidth={1.2} />
      <text className="token-tag" fill="var(--panel)" style={{ fontSize: 9 }}>
        ×2
      </text>
    </g>
  );
}

export interface TokenProps {
  f: MapFighter;
  x: number;
  y: number;
  selected?: boolean;
  ghost?: boolean;
  onPointerDown?: (e: React.PointerEvent<SVGGElement>, f: MapFighter) => void;
  onClick?: (f: MapFighter) => void;
  animate?: boolean;
}

/** Jeton posé sur une case (x, y : centre du losange). */
export const Token = memo(function Token({ f, x, y, selected, ghost, onPointerDown, onClick, animate }: TokenProps) {
  const pct = f.maxHp > 0 ? Math.max(0, Math.min(1, f.hp / f.maxHp)) : 0;
  const hpColor = pct <= 0.35 ? 'var(--hp-low)' : pct <= 0.65 ? 'var(--hp-mid)' : 'var(--hp)';
  const lift = f.kind === 'mama' ? 14 : 12;
  return (
    <g
      className={`token${ghost ? ' ghost' : ''}${animate ? ' token-move' : ''}`}
      transform={`translate(${x},${y})`}
      onPointerDown={onPointerDown ? (e) => onPointerDown(e, f) : undefined}
      onClick={onClick ? () => onClick(f) : undefined}
      role="img"
      aria-label={`${f.name}, case ${f.cell}, ${Math.round(f.hp)} PV sur ${Math.round(f.maxHp)}${f.vulnerable ? ', Vulnérable' : ''}${f.unshakable ? ', Inébranlable' : ''}${f.invulnerable ? ', Invulnérable' : ''}${f.inSpikes ? ', dans les pics' : ''}`}
    >
      {f.inSpikes ? <polygon points={SPIKE_RING} fill="var(--spike)" stroke="var(--spike-hi)" strokeWidth={1} /> : <ellipse rx={20} ry={8} cy={2} fill="var(--token-edge)" fillOpacity={0.22} />}
      {selected ? <ellipse rx={27} ry={13} className="selected-ring" /> : null}
      {f.current ? <ellipse rx={29} ry={14} className="current-ring" /> : null}
      <g transform={`translate(0,${-lift})`}>
        <TokenBody f={f} />
        {f.vulnerable ? (
          <g transform="translate(15,-14)">
            <VulnBadge />
          </g>
        ) : null}
        {f.unshakable ? (
          <g transform="translate(16,8)">
            <Padlock />
          </g>
        ) : null}
        {f.invulnerable ? (
          <g transform="translate(-17,8)">
            <ShieldBadge />
          </g>
        ) : null}
      </g>
      <g transform="translate(-17,9)">
        <rect width={34} height={5} rx={2} fill="var(--hp-bg)" stroke="var(--token-edge)" strokeWidth={0.8} />
        <rect width={34 * pct} height={5} rx={2} fill={hpColor} />
      </g>
    </g>
  );
});

/** Petit jeton autonome (listes, légendes). */
export function TokenBadge({ fighter, size = 30 }: { fighter: Pick<MapFighter, 'kind' | 'archetype' | 'monsterType' | 'short' | 'playerIndex'>; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-25 -25 50 50" aria-hidden="true" focusable="false">
      <TokenBody f={fighter} />
    </svg>
  );
}

export { SPIKE_RING, Padlock, ShieldBadge, VulnBadge };
