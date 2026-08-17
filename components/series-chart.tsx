/**
 * Two chart shapes, drawn as inline SVG. No library, no CDN, no client
 * JavaScript — these are server components rendering markup.
 *
 * The interesting part is not the drawing, it is the refusal to draw.
 *
 * A chart is a claim about a trend, and a trend needs at least two
 * observations. Every renderer below counts first and, below two, returns an
 * empty state that says exactly how many observations exist rather than a line
 * with a lone dot on it. Nothing is bucketed into fixed intervals either: an
 * empty bucket drawn as zero is an assertion that nothing happened in a window,
 * which is a different and much stronger claim than "we have no observation
 * there".
 */

import type { Series } from "@/lib/registry";
import { duration, stamp } from "@/lib/registry";

const W = 720;
const H = 190;
const PAD = { top: 14, right: 14, bottom: 26, left: 52 };
const PLOT = { w: W - PAD.left - PAD.right, h: H - PAD.top - PAD.bottom };

/* ── shared frame ──────────────────────────────────────────────────────── */

function Frame({
  title,
  definition,
  children,
  footnote,
}: {
  title: string;
  definition: string;
  children: React.ReactNode;
  footnote?: string;
}) {
  return (
    <figure className="min-w-0">
      <figcaption>
        <h3 className="text-[14px] font-semibold tracking-tight">{title}</h3>
        <p className="mt-1.5 max-w-[52ch] text-[13px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
          {definition}
        </p>
      </figcaption>
      <div className="mt-4">{children}</div>
      {footnote && (
        <p className="mt-3 max-w-[56ch] text-[12.5px] leading-relaxed" style={{ color: "var(--ink-3)" }}>
          {footnote}
        </p>
      )}
    </figure>
  );
}

/**
 * The honest empty state. It reports the observation count rather than the
 * phrase "no data", because zero observations and one observation are different
 * situations and only one of them is worth waiting on.
 */
function TooFew({ series, noun, single }: { series: Series; noun: string; single?: string }) {
  return (
    <div
      className="rounded-lg border px-4 py-6"
      style={{ borderColor: "var(--line)", background: "var(--panel)", minHeight: 140 }}
    >
      <p className="tnum font-mono text-[13px]" style={{ color: "var(--ink-2)" }}>
        {series.observations} observation{series.observations === 1 ? "" : "s"}
      </p>
      <p className="mt-2 max-w-[52ch] text-[13px] leading-relaxed" style={{ color: "var(--ink-3)" }}>
        {series.observations === 0
          ? `No ${noun} has been recorded on TestNet yet, so there is nothing to plot. This is what the chain says, not a loading state — the chart appears when the first one lands.`
          : `A line between two points needs two points. One ${noun} is on record${
              single ? `: ${single}` : ""
            }, and it is shown as a fact rather than drawn as a trend.`}
      </p>
    </div>
  );
}

/* ── geometry ──────────────────────────────────────────────────────────── */

type Scaled = { x: number; y: number; t: number; v: number; label?: string };

/**
 * Map observations onto the plot.
 *
 * When every observation shares a timestamp — six registrations in the same
 * block, say — a time axis collapses to a single column and the chart silently
 * hides five of them. In that case points are spread by ORDER and the caller is
 * told, so the axis is never labelled as time when it is not.
 */
function scale(series: Series, maxOverride?: number): { points: Scaled[]; byOrder: boolean; max: number } {
  const ts = series.points.map((p) => p.t);
  const tMin = Math.min(...ts);
  const tMax = Math.max(...ts);
  const byOrder = tMax === tMin;
  const max = Math.max(maxOverride ?? 0, ...series.points.map((p) => p.v));
  // A flat-zero series would divide by zero and, drawn against its own maximum,
  // would render zeros at full height.
  const vMax = max > 0 ? max : 1;

  const points = series.points.map((p, i) => ({
    ...p,
    x:
      PAD.left +
      (byOrder
        ? (series.points.length === 1 ? 0.5 : i / (series.points.length - 1)) * PLOT.w
        : ((p.t - tMin) / (tMax - tMin)) * PLOT.w),
    y: PAD.top + PLOT.h - (p.v / vMax) * PLOT.h,
  }));

  return { points, byOrder, max: vMax };
}

function Axes({
  series,
  byOrder,
  maxLabel,
}: {
  series: Series;
  byOrder: boolean;
  maxLabel: string;
}) {
  const first = series.points[0];
  const last = series.points[series.points.length - 1];
  return (
    <>
      {/* Two gridlines only: the baseline and the maximum. More would imply a
          resolution these handfuls of observations do not have. */}
      <line x1={PAD.left} y1={PAD.top} x2={W - PAD.right} y2={PAD.top} stroke="var(--line)" strokeWidth={1} />
      <line
        x1={PAD.left}
        y1={PAD.top + PLOT.h}
        x2={W - PAD.right}
        y2={PAD.top + PLOT.h}
        stroke="var(--line-strong)"
        strokeWidth={1}
      />
      <text x={PAD.left - 8} y={PAD.top + 4} textAnchor="end" fontSize={11} fill="var(--ink-3)" className="tnum">
        {maxLabel}
      </text>
      <text
        x={PAD.left - 8}
        y={PAD.top + PLOT.h + 4}
        textAnchor="end"
        fontSize={11}
        fill="var(--ink-3)"
        className="tnum"
      >
        0
      </text>
      <text x={PAD.left} y={H - 8} fontSize={11} fill="var(--ink-3)">
        {byOrder ? "first" : stamp(first.t)}
      </text>
      <text x={W - PAD.right} y={H - 8} textAnchor="end" fontSize={11} fill="var(--ink-3)">
        {byOrder ? "latest" : stamp(last.t)}
      </text>
    </>
  );
}

/**
 * `height` is a CSS property here, not an SVG attribute.
 *
 * As an attribute it must be a LENGTH — `auto` is a CSS keyword and the parser
 * rejects it, which is a real console error on every chart on the page:
 * `<svg> attribute height: Expected length, "auto"`. It renders anyway, so the
 * only symptom is the error.
 *
 * The responsive behaviour is unchanged and comes from the three that matter:
 * `viewBox` fixes the coordinate system, `width: 100%` fills the container, and
 * `preserveAspectRatio` scales the height to match.
 */
const svgProps = {
  viewBox: `0 0 ${W} ${H}`,
  width: "100%",
  role: "img" as const,
  preserveAspectRatio: "xMidYMid meet",
  style: { display: "block", height: "auto", overflow: "visible" as const },
};

function orderNote(byOrder: boolean, series: Series): string {
  if (byOrder) {
    return `All ${series.observations} observations carry the same block timestamp, so they are plotted in order rather than in time — the horizontal axis is sequence here, and is labelled as such.`;
  }
  return `${series.observations} observations spanning ${duration(series.spanSeconds)}. Each mark is one record on chain; nothing between them is filled in.`;
}

/* ── discrete events ───────────────────────────────────────────────────── */

/**
 * One bar per event, positioned in time, height by value.
 *
 * Bars rather than a line, because these are not samples of a continuous
 * quantity — between two settlements the settlement rate is not "somewhere in
 * between", there simply is no settlement. A line would draw a slope through
 * nothing.
 */
export function EventChart({
  series,
  title,
  definition,
  noun,
  format,
  single,
}: {
  series: Series;
  title: string;
  definition: string;
  noun: string;
  format: (v: number) => string;
  single?: string;
}) {
  if (series.observations < 2) {
    return (
      <Frame title={title} definition={definition}>
        <TooFew series={series} noun={noun} single={single} />
      </Frame>
    );
  }

  const { points, byOrder, max } = scale(series);

  // A linear axis over a wide range leaves the smallest bars under a pixel.
  // The dot still marks the observation, but a reader seeing a flat mark could
  // reasonably read it as zero — so the range is stated rather than compressed
  // onto a log axis, which would make small and large payments look comparable.
  const min = Math.min(...series.points.map((p) => p.v));
  const wideRange = min > 0 && max / min >= 20;

  return (
    <Frame
      title={title}
      definition={definition}
      footnote={
        orderNote(byOrder, series) +
        (wideRange
          ? ` Values run from ${format(min)} to ${format(max)} on a linear axis, so the smallest bars are a fraction of a pixel tall — the dot sitting on the baseline is the observation, not a zero.`
          : "")
      }
    >
      <svg {...svgProps} aria-label={`${title}. ${series.observations} observations.`}>
        <Axes series={series} byOrder={byOrder} maxLabel={format(max)} />
        {points.map((p) => (
          <g key={`${p.label ?? ""}-${p.x}`}>
            <line
              x1={p.x}
              y1={PAD.top + PLOT.h}
              x2={p.x}
              y2={p.y}
              stroke="var(--brand)"
              strokeWidth={2}
              strokeLinecap="round"
            />
            <circle cx={p.x} cy={p.y} r={3} fill="var(--brand-lo)" />
            <title>{`${format(p.v)} · ${stamp(p.t)}${p.label ? ` · ${p.label}` : ""}`}</title>
          </g>
        ))}
      </svg>
    </Frame>
  );
}

/* ── running totals ────────────────────────────────────────────────────── */

/**
 * A step line, never a smoothed one.
 *
 * A cumulative total genuinely IS flat between observations and then jumps, so
 * the step is the honest shape. A curve through the same points would imply the
 * total grew steadily in between, which is a claim about moments nothing was
 * recorded for.
 */
export function CumulativeChart({
  series,
  title,
  definition,
  noun,
  format,
  single,
}: {
  series: Series;
  title: string;
  definition: string;
  noun: string;
  format: (v: number) => string;
  single?: string;
}) {
  if (series.observations < 2) {
    return (
      <Frame title={title} definition={definition}>
        <TooFew series={series} noun={noun} single={single} />
      </Frame>
    );
  }

  const { points, byOrder, max } = scale(series);
  const base = PAD.top + PLOT.h;

  // Start at zero on the baseline under the first observation: before it, the
  // total was zero, and that is a fact rather than an extrapolation.
  const d = [`M ${PAD.left} ${base}`, `L ${points[0].x} ${base}`, `L ${points[0].x} ${points[0].y}`];
  for (let i = 1; i < points.length; i++) {
    d.push(`L ${points[i].x} ${points[i - 1].y}`, `L ${points[i].x} ${points[i].y}`);
  }
  // Hold the last value out to the right edge — the total has not changed since.
  d.push(`L ${W - PAD.right} ${points[points.length - 1].y}`);
  const line = d.join(" ");
  const area = `${line} L ${W - PAD.right} ${base} L ${PAD.left} ${base} Z`;

  return (
    <Frame title={title} definition={definition} footnote={orderNote(byOrder, series)}>
      <svg {...svgProps} aria-label={`${title}. ${series.observations} observations.`}>
        <defs>
          <linearGradient id={`fill-${title.replace(/\W/g, "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.28} />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Axes series={series} byOrder={byOrder} maxLabel={format(max)} />
        <path d={area} fill={`url(#fill-${title.replace(/\W/g, "")})`} />
        <path d={line} fill="none" stroke="var(--brand)" strokeWidth={2} strokeLinejoin="round" />
        {points.map((p) => (
          <g key={`${p.label ?? ""}-${p.x}`}>
            <circle cx={p.x} cy={p.y} r={3.2} fill="var(--bg)" stroke="var(--brand)" strokeWidth={2} />
            <title>{`${format(p.v)} · ${stamp(p.t)}${p.label ? ` · ${p.label}` : ""}`}</title>
          </g>
        ))}
      </svg>
    </Frame>
  );
}
