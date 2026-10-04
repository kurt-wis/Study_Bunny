import React from 'react';

const W = 520;
const H = 150;
const PAD = { left: 34, right: 12, top: 12, bottom: 8 };

/**
 * MasteryCurve — the small Home chart: score per completed session (0–100%),
 * drawn as a smoothed line with a soft area fill. Pure SVG, no chart library.
 *
 * @param {{ points: Array<{ pct: number, when: Date, title: string, source: string }> }} props
 */
export default function MasteryCurve({ points }) {
  const n = points.length;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = i => PAD.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = pct => PAD.top + (1 - pct / 100) * innerH;
  const coords = points.map((p, i) => [x(i), y(p.pct)]);

  let line = '';
  coords.forEach(([cx, cy], i) => {
    if (i === 0) { line = `M${cx} ${cy}`; return; }
    const [px, py] = coords[i - 1];
    const mid = (px + cx) / 2;
    line += ` C${mid} ${py} ${mid} ${cy} ${cx} ${cy}`;
  });
  const area = n > 1 ? `${line} L${coords[n - 1][0]} ${H} L${coords[0][0]} ${H} Z` : '';
  const summary = `Score per session, oldest to newest: ${points.map(p => `${p.pct}%`).join(', ')}.`;

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} className="block w-full h-auto">
        {[0, 50, 100].map(tick => (
          <g key={tick}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} stroke="var(--sb-line)" strokeDasharray="3 4" />
            <text x={0} y={y(tick) + 4} fontSize="10" fill="var(--sb-muted)">{tick}%</text>
          </g>
        ))}
        {area && <path d={area} fill="var(--sb-sky)" opacity="0.7" />}
        {n > 1 && <path d={line} fill="none" stroke="var(--sb-accent)" strokeWidth="3" strokeLinecap="round" />}
        {coords.map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r={i === n - 1 ? 5 : 3.5} fill={i === n - 1 ? 'var(--sb-accent)' : 'var(--sb-surface)'} stroke="var(--sb-accent)" strokeWidth="2">
            <title>{`${points[i].title}: ${points[i].pct}% (${points[i].source})`}</title>
          </circle>
        ))}
      </svg>
      <figcaption className="flex justify-between text-[11px] sb-muted mt-1.5" style={{ paddingLeft: `${(PAD.left / W) * 100}%` }}>
        {points.map((p, i) => (
          <span key={i} className={i === n - 1 ? 'font-bold' : undefined} style={i === n - 1 ? { color: 'var(--sb-primary)' } : undefined}>
            {i === n - 1 ? 'Latest' : p.when.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
