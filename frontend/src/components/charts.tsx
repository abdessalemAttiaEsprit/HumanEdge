import { useState } from 'react';

// =============================================================================
// Lightweight, dependency-free chart primitives for the dashboards. Built as
// plain HTML/SVG rather than pulling in a charting library, since the app only
// needs two chart shapes (a ranked bar list and a stacked monthly breakdown).
// =============================================================================

export interface BarDatum {
  label: string;
  value: number;
}

/**
 * Ranked horizontal bar list — single hue, since the category identity is
 * already carried by the row label (no legend needed). Values are always
 * direct-labeled, so there is no separate hover affordance to build.
 */
export function BarChart({
  data,
  color = 'var(--primary)',
  formatValue = (v: number) => String(v),
}: {
  data: BarDatum[];
  color?: string;
  formatValue?: (value: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));

  if (data.length === 0) {
    return <p className="chart-empty">No data yet.</p>;
  }

  return (
    <div className="hbar-chart">
      {data.map((d) => (
        <div className="hbar-chart__row" key={d.label}>
          <span className="hbar-chart__label">{d.label}</span>
          <div className="hbar-chart__track">
            <div
              className="hbar-chart__fill"
              style={{ width: `${Math.max(2, (d.value / max) * 100)}%`, background: color }}
            />
          </div>
          <span className="hbar-chart__value">{formatValue(d.value)}</span>
        </div>
      ))}
    </div>
  );
}

export interface StackedSeries {
  key: string;
  label: string;
  color: string;
}

export interface StackedDatum {
  label: string;
  values: Record<string, number>;
}

const GAP = 2; // surface-color gap between stacked segments and between bars

function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const exp = Math.floor(Math.log10(value));
  const base = 10 ** exp;
  const fraction = value / base;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return niceFraction * base;
}

/** Rect with only the top two corners rounded — the "data end" of a bar that grows from the baseline. */
function roundedTopPath(x: number, y: number, w: number, h: number, r: number): string {
  const radius = Math.min(r, w / 2, Math.max(h, 0));
  if (h <= 0) return '';
  return `M${x},${y + h} L${x},${y + radius} Q${x},${y} ${x + radius},${y} L${x + w - radius},${y} Q${x + w},${y} ${x + w},${y + radius} L${x + w},${y + h} Z`;
}

/**
 * Stacked monthly bar chart (net pay / CNSS / IRPP). Hovering anywhere on a
 * month's column shows one tooltip with every series for that month, rather
 * than requiring the pointer to land on a specific (sometimes tiny) segment.
 */
export function StackedBarChart({
  data,
  series,
  formatValue = (v: number) => String(v),
}: {
  data: StackedDatum[];
  series: StackedSeries[];
  formatValue?: (value: number) => string;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const width = 640;
  const height = 240;
  const margin = { top: 12, right: 8, bottom: 24, left: 56 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const totals = data.map((d) => series.reduce((sum, s) => sum + (d.values[s.key] ?? 0), 0));
  const niceMax = niceCeil(Math.max(1, ...totals));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * niceMax);

  const bandWidth = data.length > 0 ? plotWidth / data.length : plotWidth;
  const barWidth = Math.min(24, bandWidth * 0.55);

  if (data.length === 0) {
    return <p className="chart-empty">No data yet.</p>;
  }

  return (
    <div className="stacked-chart">
      {series.length > 1 && (
        <div className="chart-legend">
          {series.map((s) => (
            <span className="chart-legend__item" key={s.key}>
              <span className="chart-legend__swatch" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}

      <div className="stacked-chart__viz">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Monthly payroll breakdown">
          {ticks.map((t) => {
            const y = margin.top + plotHeight - (t / niceMax) * plotHeight;
            return (
              <g key={t}>
                <line x1={margin.left} x2={width - margin.right} y1={y} y2={y} className="stacked-chart__gridline" />
                <text x={margin.left - 8} y={y} textAnchor="end" dominantBaseline="middle" className="stacked-chart__axis-label">
                  {formatValue(t)}
                </text>
              </g>
            );
          })}

          {data.map((d, i) => {
            const x0 = margin.left + i * bandWidth + (bandWidth - barWidth) / 2;
            let cumulative = 0;
            const segments = series.map((s, idx) => {
              const value = d.values[s.key] ?? 0;
              const segHeightFull = niceMax > 0 ? (value / niceMax) * plotHeight : 0;
              const isTop = idx === series.length - 1;
              const yNaturalTop = margin.top + plotHeight - cumulative - segHeightFull;
              const y = isTop ? yNaturalTop : yNaturalTop + GAP;
              const h = Math.max(0, isTop ? segHeightFull : segHeightFull - GAP);
              cumulative += segHeightFull;
              return { key: s.key, color: s.color, value, x: x0, y, h, isTop };
            });

            return (
              <g key={d.label}>
                {segments.map((seg) =>
                  seg.h > 0 ? (
                    seg.isTop ? (
                      <path key={seg.key} d={roundedTopPath(seg.x, seg.y, barWidth, seg.h, 4)} fill={seg.color} />
                    ) : (
                      <rect key={seg.key} x={seg.x} y={seg.y} width={barWidth} height={seg.h} fill={seg.color} />
                    )
                  ) : null,
                )}
                <text x={x0 + barWidth / 2} y={height - 6} textAnchor="middle" className="stacked-chart__axis-label">
                  {d.label}
                </text>
                {/* Hover hit target spans the full column, not just the (sometimes tiny) segments. */}
                <rect
                  x={margin.left + i * bandWidth}
                  y={margin.top}
                  width={bandWidth}
                  height={plotHeight}
                  fill={hoverIndex === i ? 'rgba(11, 11, 11, 0.04)' : 'transparent'}
                  tabIndex={0}
                  onMouseEnter={() => setHoverIndex(i)}
                  onMouseLeave={() => setHoverIndex(null)}
                  onFocus={() => setHoverIndex(i)}
                  onBlur={() => setHoverIndex(null)}
                />
              </g>
            );
          })}
        </svg>

        {hoverIndex !== null && (
          <div
            className="stacked-chart__tooltip"
            style={{ left: `${((hoverIndex + 0.5) / data.length) * 100}%` }}
          >
            <strong>{data[hoverIndex].label}</strong>
            {series.map((s) => (
              <div className="stacked-chart__tooltip-row" key={s.key}>
                <span className="chart-legend__swatch" style={{ background: s.color }} />
                <span>{s.label}</span>
                <strong>{formatValue(data[hoverIndex].values[s.key] ?? 0)}</strong>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
