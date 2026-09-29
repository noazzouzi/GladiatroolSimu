/**
 * Graphiques SVG faits main, à l'échelle, pour l'écran Résultats : taux de victoire avec intervalle de Wilson
 * (barres horizontales), comparaisons par paires (ADDM / AADM) et histogrammes (tour de mort de la Mama).
 * Rendu à la largeur réelle du conteneur (textes lisibles à 400 px), survol = valeur exacte, tableau équivalent.
 */
import { useEffect, useRef, useState } from 'react';
import { fmtPct } from '../model/format.js';

export function useWidth<T extends HTMLElement>(fallback = 640): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setW(Math.max(280, Math.round(el.clientWidth)));
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export interface RateRow {
  key: string;
  label: string;
  sub?: string;
  wins: number;
  runs: number;
  rate: number;
  ci: [number, number];
  color: string;
}

export interface RateGroup {
  key: string;
  label: string;
  rows: RateRow[];
}

/**
 * Taux de victoire en barres horizontales (0-100 %), moustaches = IC de Wilson à 95 %. Groupes facultatifs (une
 * ligne de titre puis une barre par série).
 */
export function WinRateChart({ groups, title, idPrefix }: { groups: RateGroup[]; title: string; idPrefix: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);
  const need = Math.max(0, ...groups.flatMap((g) => g.rows.map((r) => (r.label + (r.sub ? ` ${r.sub}` : '')).length))) * 6.6 + 8;
  const narrow = width < 560 || need > width * 0.45;
  const labelW = narrow ? 0 : Math.round(Math.max(60, need));
  const valueW = 58;
  const plotX = labelW + 8;
  const plotW = Math.max(120, width - plotX - valueW - 8);
  const barH = 14;
  const rowH = narrow ? 36 : 24;
  const groupH = 22;
  const rows: { y: number; row: RateRow; group: RateGroup }[] = [];
  const heads: { y: number; g: RateGroup }[] = [];
  let y = 22;
  for (const g of groups) {
    if (g.label) {
      heads.push({ y, g });
      y += groupH;
    }
    for (const r of g.rows) {
      rows.push({ y, row: r, group: g });
      y += rowH;
    }
    y += 6;
  }
  const height = y + 8;
  const sx = (v: number) => plotX + v * plotW;
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const hovered = rows.find((r) => `${r.group.key}/${r.row.key}` === hover)?.row;
  return (
    <figure style={{ margin: 0 }}>
      <figcaption className="sr-only">{title}</figcaption>
      <div ref={ref}>
        <svg className="chart" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="gridline" x1={sx(t)} x2={sx(t)} y1={16} y2={height - 6} />
              <text className="axis-label" x={sx(t)} y={11} textAnchor={t === 0 ? 'start' : t === 1 ? 'end' : 'middle'}>
                {Math.round(t * 100)} %
              </text>
            </g>
          ))}
          {heads.map(({ y: gy, g }) => (
            <text key={`h${g.key}`} x={0} y={gy + 14} style={{ fontWeight: 600, fill: 'var(--ink)' }}>
              {g.label}
            </text>
          ))}
          {rows.map(({ y: ry, row, group }) => {
            const k = `${group.key}/${row.key}`;
            const by = narrow ? ry + 16 : ry + (rowH - barH) / 2;
            return (
              <g key={k} onMouseEnter={() => setHover(k)} onFocus={() => setHover(k)} tabIndex={0} aria-label={`${row.label} : ${row.wins} victoires sur ${row.runs} (${fmtPct(row.rate)}), IC 95 % ${fmtPct(row.ci[0])} à ${fmtPct(row.ci[1])}`}>
                {hover === k ? <rect className="row-hover" x={0} y={ry} width={width} height={rowH} rx={3} /> : null}
                <text x={narrow ? plotX : labelW} y={narrow ? ry + 9 : ry + rowH / 2 + 4} textAnchor={narrow ? 'start' : 'end'}>
                  {row.label}
                  {row.sub ? <tspan className="axis-label"> {row.sub}</tspan> : null}
                </text>
                <rect x={plotX} y={by} width={Math.max(2, sx(row.rate) - plotX)} height={barH} rx={4} fill={row.color} />
                <line className="ci" x1={sx(row.ci[0])} x2={sx(row.ci[1])} y1={by + barH / 2} y2={by + barH / 2} />
                <line className="ci" x1={sx(row.ci[0])} x2={sx(row.ci[0])} y1={by + 2} y2={by + barH - 2} />
                <line className="ci" x1={sx(row.ci[1])} x2={sx(row.ci[1])} y1={by + 2} y2={by + barH - 2} />
                <text className="value-label" x={width - 2} y={by + barH / 2 + 4} textAnchor="end">
                  {fmtPct(row.rate, 0)}
                </text>
                <rect className="hit" x={0} y={ry} width={width} height={rowH} />
              </g>
            );
          })}
        </svg>
      </div>
      <div className="chart-tip" aria-live="polite">
        {hovered ? (
          <>
            <strong>{hovered.label}</strong> : {hovered.wins} / {hovered.runs} victoires ({fmtPct(hovered.rate)}), IC de Wilson à 95 % [{fmtPct(hovered.ci[0])} ; {fmtPct(hovered.ci[1])}]
          </>
        ) : (
          <span className="muted">Barres : taux de victoire ; trait : intervalle de confiance de Wilson à 95 %. Survolez une barre pour les valeurs.</span>
        )}
      </div>
      <details>
        <summary className="small" style={{ cursor: 'pointer' }} id={`${idPrefix}-tableau`}>
          Tableau des valeurs
        </summary>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Variante</th>
                <th scope="col" className="num">
                  Victoires
                </th>
                <th scope="col" className="num">
                  Taux
                </th>
                <th scope="col" className="num">
                  IC 95 % (Wilson)
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ row, group }) => (
                <tr key={`${group.key}/${row.key}`}>
                  <td>
                    {group.label ? `${group.label} — ` : ''}
                    {row.label}
                  </td>
                  <td className="num">
                    {row.wins} / {row.runs}
                  </td>
                  <td className="num">{fmtPct(row.rate)}</td>
                  <td className="num">
                    {fmtPct(row.ci[0])} – {fmtPct(row.ci[1])}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

export interface HistSeries {
  key: string;
  label: string;
  color: string;
  /** Catégorie → nombre. */
  counts: Record<string, number>;
  total: number;
}

/** Histogramme en colonnes groupées (part des combats par catégorie : tour de mort de la Mama…). */
export function GroupedHistogram({ categories, series, title, idPrefix, categoryLabel }: { categories: { key: string; label: string }[]; series: HistSeries[]; title: string; idPrefix: string; categoryLabel: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);
  const height = 220;
  const left = 36;
  const bottom = 30;
  const top = 12;
  const plotW = width - left - 6;
  const plotH = height - top - bottom;
  const max = Math.max(0.05, ...series.flatMap((s) => categories.map((c) => (s.counts[c.key] ?? 0) / Math.max(1, s.total))));
  const yMax = Math.ceil(max * 10) / 10;
  const band = plotW / categories.length;
  const gap = 2;
  const barW = Math.max(4, (band * 0.72 - gap * (series.length - 1)) / series.length);
  const sy = (v: number) => top + plotH - (v / yMax) * plotH;
  const ticks = [0, yMax / 2, yMax];
  const hovered = hover ? hover.split('|') : null;
  return (
    <figure style={{ margin: 0 }}>
      <figcaption className="sr-only">{title}</figcaption>
      <div className="legend" style={{ marginBottom: 4 }}>
        {series.map((s) => (
          <span key={s.key}>
            <span className="swatch" style={{ background: s.color }} />
            {s.label} <span className="muted">({s.total} combats)</span>
          </span>
        ))}
      </div>
      <div ref={ref}>
        <svg className="chart" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="gridline" x1={left} x2={width - 4} y1={sy(t)} y2={sy(t)} />
              <text className="axis-label" x={left - 4} y={sy(t) + 4} textAnchor="end">
                {Math.round(t * 100)} %
              </text>
            </g>
          ))}
          <line className="baseline" x1={left} x2={width - 4} y1={sy(0)} y2={sy(0)} />
          {categories.map((c, ci) => {
            const x0 = left + ci * band + (band - (barW * series.length + gap * (series.length - 1))) / 2;
            return (
              <g key={c.key}>
                {series.map((s, si) => {
                  const v = (s.counts[c.key] ?? 0) / Math.max(1, s.total);
                  const x = x0 + si * (barW + gap);
                  const k = `${c.key}|${s.key}`;
                  const h = Math.max(0, sy(0) - sy(v));
                  return (
                    <g key={k} onMouseEnter={() => setHover(k)} tabIndex={0} onFocus={() => setHover(k)} aria-label={`${s.label}, ${c.label} : ${fmtPct(v, 0)}`}>
                      <path d={h > 4 ? `M${x},${sy(0)} V${sy(v) + 4} Q${x},${sy(v)} ${x + 4},${sy(v)} H${x + barW - 4} Q${x + barW},${sy(v)} ${x + barW},${sy(v) + 4} V${sy(0)} Z` : `M${x},${sy(0)} h${barW} v${-h} h${-barW} Z`} fill={s.color} opacity={hover && hover !== k ? 0.55 : 1} />
                      <rect className="hit" x={x - 1} y={top} width={barW + 2} height={plotH} />
                    </g>
                  );
                })}
                <text className="axis-label" x={left + ci * band + band / 2} y={height - bottom + 16} textAnchor="middle">
                  {c.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="chart-tip" aria-live="polite">
        {hovered ? (
          (() => {
            const s = series.find((x) => x.key === hovered[1])!;
            const c = categories.find((x) => x.key === hovered[0])!;
            const n = s.counts[c.key] ?? 0;
            return (
              <>
                <strong>{s.label}</strong>, {categoryLabel} {c.label} : {n} combats sur {s.total} ({fmtPct(n / Math.max(1, s.total))})
              </>
            );
          })()
        ) : (
          <span className="muted">Part des combats par {categoryLabel}. Survolez une colonne pour les valeurs.</span>
        )}
      </div>
      <details>
        <summary className="small" style={{ cursor: 'pointer' }} id={`${idPrefix}-tableau`}>
          Tableau des valeurs
        </summary>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">{categoryLabel}</th>
                {series.map((s) => (
                  <th key={s.key} scope="col" className="num">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.key}>
                  <td>{c.label}</td>
                  {series.map((s) => (
                    <td key={s.key} className="num">
                      {s.counts[c.key] ?? 0} ({fmtPct((s.counts[c.key] ?? 0) / Math.max(1, s.total), 0)})
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

/** Différence appariée (moyenne et IC à 95 %) sur un axe centré en 0. */
export function DiffChart({ rows, unit, title, digits = 1 }: { rows: { key: string; label: string; mean: number; low: number; high: number }[]; unit: string; title: string; digits?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const need = Math.max(0, ...rows.map((r) => r.label.length)) * 6.6 + 8;
  const narrow = width < 560 || need > width * 0.45;
  const labelW = narrow ? 0 : Math.round(need);
  const plotX = labelW + 10;
  const plotW = width - plotX - 70;
  const rowH = narrow ? 38 : 26;
  const height = rows.length * rowH + 28;
  const ext = Math.max(0.01, ...rows.flatMap((r) => [Math.abs(r.low), Math.abs(r.high)])) * 1.1;
  const sx = (v: number) => plotX + ((v + ext) / (2 * ext)) * plotW;
  const f = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits).replace('.', ',')}`;
  return (
    <div ref={ref}>
      <svg className="chart" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
        <line className="baseline" x1={sx(0)} x2={sx(0)} y1={14} y2={height - 4} />
        <text className="axis-label" x={sx(0)} y={10} textAnchor="middle">
          0
        </text>
        <text className="axis-label" x={sx(-ext)} y={10} textAnchor="start">
          {f(-ext)} {unit}
        </text>
        <text className="axis-label" x={sx(ext)} y={10} textAnchor="end">
          {f(ext)} {unit}
        </text>
        {rows.map((r, i) => {
          const y = 20 + i * rowH;
          const cy = narrow ? y + 22 : y + rowH / 2;
          return (
            <g key={r.key}>
              <text x={narrow ? plotX : labelW} y={narrow ? y + 9 : cy + 4} textAnchor={narrow ? 'start' : 'end'}>
                {r.label}
              </text>
              <line className="ci" x1={sx(r.low)} x2={sx(r.high)} y1={cy} y2={cy} />
              <line className="ci" x1={sx(r.low)} x2={sx(r.low)} y1={cy - 5} y2={cy + 5} />
              <line className="ci" x1={sx(r.high)} x2={sx(r.high)} y1={cy - 5} y2={cy + 5} />
              <circle cx={sx(r.mean)} cy={cy} r={5} fill="var(--accent)" stroke="var(--panel)" strokeWidth={2} />
              <text className="value-label" x={width - 2} y={cy + 4} textAnchor="end">
                {f(r.mean)} {unit}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
