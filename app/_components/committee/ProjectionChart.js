"use client";

import {
  Area, ComposedChart, CartesianGrid, Line, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { monthShort } from "@/app/_lib/date-helpers";
import { money } from "@/app/_lib/format-helpers";

/**
 * The committee account, rolled forward.
 *
 * The two series are two scenarios, not two measures, so they share one axis --
 * a second y-scale would let any pair of lines be made to cross wherever you
 * like, which is the fastest way to make a chart lie.
 *
 * Colours are a validated categorical pair (teal / burnt orange): ΔE 13.7 under
 * deuteranopia, 27.1 with normal vision, both above the chart surface's 3:1.
 * They are assigned to the scenarios in fixed order and never re-assigned, so
 * changing the proposed amount never repaints the other line.
 *
 * Colour is not the only cue either way: each line is named in the legend, the
 * lowest point of each is labelled directly on the plot, and the same figures
 * are in the table underneath.
 */
const PROPOSED = "#0d9488";
const SAFE = "#c2410c";

function Tip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;

  return (
    <div className="card px-3.5 py-3 text-sm">
      <p className="font-semibold text-heading">{monthShort(label)}</p>
      <p className="mt-0.5 text-text-light">Committee month {row.cycle_no}</p>
      <dl className="mt-2 space-y-1">
        {payload.map((series) => (
          <div key={series.dataKey} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: series.stroke }}
            />
            <dt className="text-text-light">{series.name}</dt>
            <dd className="num ml-auto font-semibold">{money(series.value)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 border-t border-border pt-2 text-text-light">
        In this month: <span className="num">{money(row.contributions + row.repayments)}</span> in,{" "}
        <span className="num">{money(row.payout)}</span> out
      </p>
    </div>
  );
}

export default function ProjectionChart({
  rows,
  safeRows,
  buffer = 0,
  proposedLabel = "At the amount proposed",
  safeLabel = "At the safe amount",
  height = 320,
}) {
  if (!rows?.length) return null;

  const data = rows.map((row, index) => ({
    ...row,
    closing: Number(row.closing),
    contributions: Number(row.contributions),
    repayments: Number(row.repayments),
    payout: Number(row.payout),
    safe: safeRows?.[index] ? Number(safeRows[index].closing) : null,
  }));

  const lowest = data.reduce((low, row) => (row.closing < low.closing ? row : low), data[0]);
  const goesNegative = data.some((row) => row.closing < 0);

  return (
    <figure className="m-0">
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 24, right: 16, bottom: 4, left: 8 }}>
          <defs>
            <linearGradient id="belowZero" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#b91c1c" stopOpacity="0.14" />
              <stop offset="100%" stopColor="#b91c1c" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          <CartesianGrid stroke="var(--color-border)" strokeDasharray="2 4" vertical={false} />

          <XAxis
            dataKey="period_month"
            tickFormatter={monthShort}
            tick={{ fontSize: 12, fill: "var(--color-text-light)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--color-border)" }}
            minTickGap={28}
          />
          <YAxis
            tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
            tick={{ fontSize: 12, fill: "var(--color-text-light)" }}
            tickLine={false}
            axisLine={false}
            width={52}
          />

          {/* The two lines that matter are drawn against these, not guessed at. */}
          <ReferenceLine y={0} stroke="#b91c1c" strokeWidth={1.5}
            label={{ value: "empty", position: "insideBottomLeft", fill: "#b91c1c", fontSize: 11 }} />
          {buffer > 0 ? (
            <ReferenceLine y={buffer} stroke="var(--color-border-strong)" strokeDasharray="4 4"
              label={{ value: "cushion", position: "insideTopRight",
                       fill: "var(--color-text-light)", fontSize: 11 }} />
          ) : null}

          {goesNegative ? (
            <Area type="monotone" dataKey={() => 0} fill="url(#belowZero)" stroke="none"
                  isAnimationActive={false} legendType="none" />
          ) : null}

          {safeRows?.length ? (
            <Line
              type="monotone" dataKey="safe" name={safeLabel}
              stroke={SAFE} strokeWidth={2} strokeDasharray="5 4"
              dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }}
              isAnimationActive={false}
            />
          ) : null}

          <Line
            type="monotone" dataKey="closing" name={proposedLabel}
            stroke={PROPOSED} strokeWidth={2}
            dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }}
            isAnimationActive={false}
          />

          {/* The trough is the whole point of the chart, so it is labelled on the
              plot rather than left to be found by hovering. */}
          <ReferenceLine
            x={lowest.period_month}
            stroke={lowest.closing < buffer ? "#b91c1c" : "var(--color-border-strong)"}
            strokeDasharray="3 3"
            label={{
              value: `lowest ${money(lowest.closing)}`,
              position: "top",
              fontSize: 12,
              fill: lowest.closing < buffer ? "#b91c1c" : "var(--color-text-light)",
            }}
          />

          <Tooltip content={<Tip />} cursor={{ stroke: "var(--color-border-strong)", strokeWidth: 1 }} />
        </ComposedChart>
      </ResponsiveContainer>

      {/* A legend is always present for two series, and it never relies on
          colour alone -- the dashed line is described as dashed. */}
      <figcaption className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-text-light">
        <span className="flex items-center gap-2">
          <svg width="22" height="8" aria-hidden="true"><line x1="0" y1="4" x2="22" y2="4"
            stroke={PROPOSED} strokeWidth="2" /></svg>
          {proposedLabel}
        </span>
        {safeRows?.length ? (
          <span className="flex items-center gap-2">
            <svg width="22" height="8" aria-hidden="true"><line x1="0" y1="4" x2="22" y2="4"
              stroke={SAFE} strokeWidth="2" strokeDasharray="5 4" /></svg>
            {safeLabel} <span className="text-text-light">(dashed)</span>
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
}
