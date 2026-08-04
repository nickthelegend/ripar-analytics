"use client";

/**
 * The measurement half of the page: MainNet cadence, real fees, USDC movement,
 * read from the browser so nothing of ours sits between the reader and the
 * numbers.
 *
 * Split out of `app/page.tsx` when Ripar's own registry numbers arrived. Those
 * come off TestNet box storage and need an ARC-4 decoder, which belongs on the
 * server — so the page is now a server component and this is the client island
 * inside it. `children` is where the server-rendered registry section lands,
 * keeping the reading order the page always had: measure the chain, then report
 * what Ripar has done on it.
 */

import { Mark } from "@/components/mark";
import {
  EXPLORER,
  USDC_ASSET,
  WINDOW,
  meanFee,
  meanGap,
  totalTxns,
  useChain,
  useUsdc,
  type Block,
} from "@/lib/chain";

const fmt = (n: number, d = 0) =>
  n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

/* ── the spine: blocks landing ─────────────────────────────────────────── */
function Tape({ blocks }: { blocks: Block[] }) {
  const shown = [...blocks].reverse();
  return (
    <ol className="divide-y" style={{ borderColor: "var(--line)" }}>
      {shown.map((b, i) => (
        <li
          key={b.round}
          className={i === 0 ? "land" : undefined}
          style={{ borderColor: "var(--line)" }}
        >
          <div className="flex items-baseline gap-4 border-b px-1 py-2.5" style={{ borderColor: "var(--line)" }}>
            <a
              href={`${EXPLORER}/block/${b.round}`}
              target="_blank"
              rel="noreferrer"
              className="tnum font-mono text-[13px] tracking-tight transition-colors hover:text-[var(--brand)]"
              style={{ color: i === 0 ? "var(--brand)" : "var(--ink)" }}
            >
              {b.round.toLocaleString("en-US")}
            </a>
            <span className="tnum ml-auto font-mono text-[13px]" style={{ color: "var(--ink-2)" }}>
              {b.txns} txn
            </span>
            <span
              className="tnum w-[52px] text-right font-mono text-[13px]"
              style={{ color: b.gap != null && b.gap <= 3 ? "var(--good)" : "var(--ink-3)" }}
            >
              {b.gap != null ? `${b.gap.toFixed(1)}s` : "—"}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ── consistency, drawn from the same gaps the tape shows ──────────────── */
function GapProfile({ blocks }: { blocks: Block[] }) {
  const gaps = blocks.map((b) => b.gap).filter((g): g is number => g != null && g > 0);
  if (gaps.length < 4) return null;
  const max = Math.max(...gaps, 5);
  return (
    <div>
      <div className="flex h-[72px] items-end gap-[3px]">
        {gaps.map((g, i) => (
          <div
            key={i}
            title={`${g.toFixed(1)}s`}
            className="flex-1 rounded-[2px] transition-all duration-500"
            style={{
              height: `${Math.max(6, (g / max) * 100)}%`,
              background:
                g <= 3 ? "linear-gradient(180deg,#ff9d4f,#ff6b2b)" : "rgba(255,255,255,0.18)",
            }}
          />
        ))}
      </div>
      <p className="mt-3 text-[13px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
        Every bar is one real gap between consecutive blocks, oldest at the left. Bars
        stay level because Algorand finalises on a fixed cadence — the flat profile
        is the point, not the height.
      </p>
    </div>
  );
}

export function LiveChain({ children }: { children: React.ReactNode }) {
  const { blocks, status, error } = useChain();
  const { data: usdc } = useUsdc();

  const gap = meanGap(blocks);
  const fee = meanFee(blocks);
  const txns = totalTxns(blocks);
  const head = blocks.at(-1);

  // What a caller pays per request, at the fee actually observed.
  const perCall = fee != null ? fee : null;

  return (
    <div className="mx-auto max-w-[1080px] px-5 sm:px-8">
      {/* masthead */}
      <header
        className="flex items-center gap-3 border-b py-5"
        style={{ borderColor: "var(--line)" }}
      >
        <a href="https://ripar.io" className="flex items-center gap-2.5">
          <Mark size={24} />
          <span className="text-[15px] font-semibold tracking-tight">Ripar</span>
        </a>
        <span className="text-[15px]" style={{ color: "var(--ink-3)" }}>
          Analytics
        </span>
        <div className="ml-auto flex items-center gap-2">
          <span
            className={status === "live" ? "beat" : undefined}
            style={{
              width: 7,
              height: 7,
              borderRadius: 99,
              background: status === "error" ? "#f87171" : status === "live" ? "var(--good)" : "var(--ink-3)",
            }}
          />
          <span className="tnum font-mono text-[12px]" style={{ color: "var(--ink-2)" }}>
            {status === "live" && head
              ? `MainNet · round ${head.round.toLocaleString("en-US")}`
              : status === "error"
                ? "connection lost"
                : "connecting…"}
          </span>
        </div>
      </header>

      {/* the claim, and the measurement that settles it */}
      <section className="py-14 sm:py-20">
        <h1 className="max-w-[19ch] text-[2.1rem] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[3rem]">
          Sub-cent payments only work if settlement is cheaper than the call.
        </h1>
        <p
          className="mt-6 max-w-[62ch] text-[16px] leading-relaxed sm:text-[17px]"
          style={{ color: "var(--ink-2)" }}
        >
          Ripar charges per HTTP request, which is only credible if the chain underneath
          is fast and nearly free. So rather than assert it, this page measures it — your
          browser reads Algorand&rsquo;s public nodes directly, and every figure below
          comes from blocks that landed while you were looking.
        </p>

        <p className="mt-9 max-w-[62ch] text-[17px] leading-[1.9] sm:text-[19px]">
          Over the last <span className="tnum font-medium">{blocks.length || WINDOW}</span> blocks,
          settlement took{" "}
          <span className="tnum font-semibold" style={{ color: "var(--brand)" }}>
            {gap ? `${gap.toFixed(2)}s` : "—"}
          </span>{" "}
          on average and cost{" "}
          <span className="tnum font-semibold" style={{ color: "var(--brand)" }}>
            {perCall != null ? `${perCall.toFixed(4)} ALGO` : "—"}
          </span>{" "}
          per transaction, across{" "}
          <span className="tnum font-medium">{fmt(txns)}</span> transactions.
        </p>

        {status === "error" && (
          <p className="mt-6 text-[14px]" style={{ color: "#f87171" }}>
            Lost the connection to the public node{error ? ` (${error})` : ""}. Nothing is
            cached or estimated here, so the figures above stop rather than drift. Retrying
            every two seconds.
          </p>
        )}
      </section>

      {/* the tape + the consistency profile */}
      <section className="grid gap-10 border-t py-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16" style={{ borderColor: "var(--line)" }}>
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight">Blocks, as they land</h2>
          <p className="mt-2 max-w-[46ch] text-[13.5px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
            The newest row is highlighted the moment it arrives. Round numbers link to
            the explorer, so any figure on this page can be checked against a source
            that has nothing to do with us.
          </p>
          <div className="mt-6 max-h-[420px] overflow-y-auto pr-1">
            {blocks.length ? (
              <Tape blocks={blocks} />
            ) : (
              <p className="py-8 font-mono text-[13px]" style={{ color: "var(--ink-3)" }}>
                reading the chain…
              </p>
            )}
          </div>
        </div>

        <div>
          <h2 className="text-[15px] font-semibold tracking-tight">Time between blocks</h2>
          <p className="mt-2 max-w-[46ch] text-[13.5px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
            Speed matters less than predictability. An agent budgeting for a paid call
            needs to know settlement will not occasionally take a minute.
          </p>
          <div className="mt-6">
            <GapProfile blocks={blocks} />
          </div>

          <dl className="mt-10 space-y-3 border-t pt-6 text-[14px]" style={{ borderColor: "var(--line)" }}>
            {[
              ["Slowest block in the window", gap && blocks.length ? `${Math.max(...blocks.map((b) => b.gap ?? 0)).toFixed(1)}s` : "—"],
              ["Fastest block in the window", gap && blocks.length ? `${Math.min(...blocks.filter((b) => b.gap).map((b) => b.gap as number)).toFixed(1)}s` : "—"],
              ["Transactions per block", blocks.length ? fmt(txns / blocks.length, 1) : "—"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-6">
                <dt style={{ color: "var(--ink-2)" }}>{k}</dt>
                <dd className="tnum font-mono">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* USDC — the asset a caller actually pays in */}
      <section className="border-t py-12" style={{ borderColor: "var(--line)" }}>
        <h2 className="text-[15px] font-semibold tracking-tight">USDC on Algorand</h2>
        <p className="mt-2 max-w-[62ch] text-[13.5px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
          Payments settle in native USDC (asset{" "}
          <a
            href={`${EXPLORER}/asset/${USDC_ASSET}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono underline underline-offset-2 hover:text-[var(--brand)]"
          >
            {USDC_ASSET}
          </a>
          ), not a bridged wrapper. This is the most recent slice the public indexer will
          return, so it is a sample of real movement rather than a total.
        </p>
        {usdc ? (
          <p className="mt-6 max-w-[62ch] text-[17px] leading-[1.9]">
            The last <span className="tnum font-medium">{fmt(usdc.transfers)}</span> USDC
            transfers moved{" "}
            <span className="tnum font-semibold" style={{ color: "var(--brand)" }}>
              {fmt(usdc.volume, 2)} USDC
            </span>
            {usdc.spanSeconds > 0 && (
              <>
                {" "}
                in{" "}
                <span className="tnum font-medium">
                  {usdc.spanSeconds < 90
                    ? `${usdc.spanSeconds}s`
                    : `${(usdc.spanSeconds / 60).toFixed(1)} min`}
                </span>
              </>
            )}
            .
          </p>
        ) : (
          <p className="mt-6 font-mono text-[13px]" style={{ color: "var(--ink-3)" }}>
            reading the indexer…
          </p>
        )}
      </section>

      {/* Ripar's own numbers, rendered on the server from TestNet box storage */}
      {children}

      <footer
        className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t py-8 text-[13px]"
        style={{ borderColor: "var(--line)", color: "var(--ink-3)" }}
      >
        <span>
          Chain measurements read live from Algorand MainNet via public AlgoNode endpoints.
          Ripar&rsquo;s own records are read from TestNet box storage. No account, no key,
          no server in between.
        </span>
        <a href="https://ripar.io" className="ml-auto hover:text-[var(--ink)]">
          ripar.io
        </a>
        <a href="https://docs.ripar.io" className="hover:text-[var(--ink)]">
          Docs
        </a>
        <a href="https://explorer.ripar.io" className="hover:text-[var(--ink)]">
          Explorer
        </a>
        <a href={EXPLORER} target="_blank" rel="noreferrer" className="hover:text-[var(--ink)]">
          allo.info
        </a>
      </footer>
    </div>
  );
}
