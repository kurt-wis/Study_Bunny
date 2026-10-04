import React from 'react';
import {
  findInflection,
  techniquesInCurve,
  seriesLabelFor,
  seriesColorFor,
  CURVE_SERIES,
} from '../services/dashboard/learningCurve.js';

/**
 * LearningCurve — a pure SVG/CSS line chart of mastery per attempt over time
 * (Req 7.1, 7.2; design §7). No charting library (v5 §8.4): the whole chart is
 * inline SVG plus a text table, so it works offline and stays small.
 *
 * Accessibility (FEATURES.md §9): color is never the only signal. Each point is
 * also a distinct marker on the line, the inflection (first technique switch) is
 * drawn as a labelled vertical rule, a text legend names every technique, and a
 * visually-hidden data table lists every attempt so screen-reader users get the
 * same information. The SVG itself is `aria-hidden` and the table carries the
 * accessible content.
 *
 * Props:
 *   - points: ordered curve points from `buildCurvePoints` (each
 *     { attempt, mastery, score, total, technique, source, createdAt, label }).
 */
export default function LearningCurve({ points = [] }) {
  if (!Array.isArray(points) || points.length === 0) return null;

  // ── Geometry ────────────────────────────────────────────────────────────
  // A fixed viewBox keeps the chart crisp at any width (SVG scales to its box).
  const W = 320;
  const H = 160;
  const padL = 28; // room for the y-axis % labels
  const padR = 10;
  const padT = 12;
  const padB = 22; // room for the x-axis attempt labels
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const n = points.length;
  // x: evenly spaced by attempt order; y: mastery 0 (bottom) → 1 (top).
  const xOf = i => (n === 1 ? padL + plotW / 2 : padL + (plotW * i) / (n - 1));
  const yOf = m => padT + plotH * (1 - Math.max(0, Math.min(1, m)));

  const coords = points.map((p, i) => ({ ...p, x: xOf(i), y: yOf(p.mastery) }));
  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');

  const inflection = findInflection(points);
  const inflectionX = inflection ? xOf(inflection.attempt - 1) : null;

  const seriesKeys = techniquesInCurve(points);
  const multiTechnique = seriesKeys.length > 1;

  // Horizontal gridlines + y labels at 0 / 50 / 100%.
  const yTicks = [0, 0.5, 1];

  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label="Learning curve: mastery per attempt over time. The full data is in the table below."
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Gridlines + y-axis labels */}
        {yTicks.map(t => {
          const y = yOf(t);
          return (
            <g key={t}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#f1f5f9" strokeWidth="1" />
              <text x={padL - 4} y={y + 3} textAnchor="end" fontSize="8" fill="#94a3b8">
                {Math.round(t * 100)}%
              </text>
            </g>
          );
        })}

        {/* Inflection marker: where the technique first changed (Req 7.2) */}
        {inflectionX != null && (
          <g>
            <line
              x1={inflectionX}
              y1={padT}
              x2={inflectionX}
              y2={padT + plotH}
              stroke="#f59e0b"
              strokeWidth="1.5"
              strokeDasharray="3 3"
            />
            <text
              x={inflectionX}
              y={padT - 3}
              textAnchor="middle"
              fontSize="7.5"
              fill="#b45309"
              fontWeight="bold"
            >
              switched
            </text>
          </g>
        )}

        {/* The curve line (neutral indigo so technique color lives in the points) */}
        <path d={linePath} fill="none" stroke="#c7d2fe" strokeWidth="2" strokeLinejoin="round" />

        {/* Points: color by technique, with a distinct marker shape per source so
            color is never the only differentiator (review = ring, quiz = dot). */}
        {coords.map(c => {
          const color = seriesColorFor(c.technique);
          const r = 4;
          return c.source === 'review' ? (
            <circle
              key={c.attempt}
              cx={c.x}
              cy={c.y}
              r={r}
              fill="#ffffff"
              stroke={color}
              strokeWidth="2.5"
            />
          ) : (
            <circle key={c.attempt} cx={c.x} cy={c.y} r={r} fill={color} />
          );
        })}

        {/* x-axis attempt labels (first, middle-ish, last to avoid crowding) */}
        {coords.map((c, i) => {
          const show = n <= 6 || i === 0 || i === n - 1 || i === Math.floor((n - 1) / 2);
          if (!show) return null;
          return (
            <text key={`xl-${c.attempt}`} x={c.x} y={H - 6} textAnchor="middle" fontSize="8" fill="#94a3b8">
              {c.attempt}
            </text>
          );
        })}
      </svg>

      {/* Legend — text + color swatch (color is never the only signal) */}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1" aria-hidden="true">
        {seriesKeys.map(key => (
          <span key={key} className="inline-flex items-center gap-1.5 text-xs text-gray-600">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: CURVE_SERIES[key].color }}
            />
            {seriesLabelFor(key)}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
          <span className="inline-block w-2.5 h-2.5 rounded-full border-2 border-gray-400 bg-white" />
          Review session (ring)
        </span>
      </div>
      {inflection && (
        <p className="mt-1 text-xs text-amber-700">
          Dashed line marks attempt {inflection.attempt}, where you switched from{' '}
          {seriesLabelFor(inflection.from)} to {seriesLabelFor(inflection.to)}.
        </p>
      )}

      {/* Accessible data table — the SR-equivalent of the chart (WCAG) */}
      <table className="sr-only">
        <caption>Mastery per attempt over time</caption>
        <thead>
          <tr>
            <th scope="col">Attempt</th>
            <th scope="col">Mastery</th>
            <th scope="col">Score</th>
            <th scope="col">Technique</th>
            <th scope="col">Source</th>
            <th scope="col">Date</th>
          </tr>
        </thead>
        <tbody>
          {points.map(p => (
            <tr key={p.attempt}>
              <td>{p.attempt}</td>
              <td>{Math.round(p.mastery * 100)}%</td>
              <td>{p.score}/{p.total}</td>
              <td>{seriesLabelFor(p.technique)}</td>
              <td>{p.source === 'review' ? 'Review' : 'Quiz'}</td>
              <td>
                {p.createdAt
                  ? p.createdAt.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {!multiTechnique && (
        <p className="sr-only">
          All attempts used one technique, so there is no technique-switch inflection point.
        </p>
      )}
    </div>
  );
}
