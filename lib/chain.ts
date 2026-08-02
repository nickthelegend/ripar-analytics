"use client";

import { useEffect, useRef, useState } from "react";

// AlgoNode's public endpoints serve `access-control-allow-origin: *`, so the
// browser talks to Algorand directly. No proxy, no key, and nothing between
// the reader and the chain that could massage a number on the way through.
const ALGOD = "https://mainnet-api.algonode.cloud";
const INDEXER = "https://mainnet-idx.algonode.cloud";
export const USDC_ASSET = 31566704;
export const EXPLORER = "https://allo.info";

/** Blocks kept on the tape. Also the window every derived figure is measured over. */
export const WINDOW = 24;

/** How far back the USDC sample reaches, in rounds (~45 min at 2.7s). */
export const RECENT_ROUNDS = 1000;

export type Block = {
  round: number;
  ts: number; // unix seconds, from the block header
  txns: number;
  fees: number; // microALGO actually paid across this block's transactions
  gap: number | null; // seconds since the previous block on the tape
};

export type ChainState = {
  blocks: Block[];
  status: "connecting" | "live" | "error";
  error: string | null;
};

async function json<T>(url: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(url, { signal, cache: "no-store" });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json() as Promise<T>;
}

// `block.fees` is the fee-SINK ADDRESS, not a fee total — summing it yields
// NaN. Real fees are per transaction, on txn.txn.fee, in microALGO.
type RawTxn = { txn?: { fee?: number } };
type RawBlock = { block: { rnd: number; ts: number; txns?: RawTxn[]; fees?: string } };

async function getBlock(round: number, signal?: AbortSignal): Promise<Omit<Block, "gap">> {
  const { block } = await json<RawBlock>(`${ALGOD}/v2/blocks/${round}?format=json`, signal);
  const txns = block.txns ?? [];
  return {
    round: block.rnd,
    ts: block.ts,
    txns: txns.length,
    fees: txns.reduce((s, t) => s + (t.txn?.fee ?? 0), 0),
  };
}

/**
 * Follows the chain head. Seeds with the last WINDOW blocks so the page has
 * something true to show immediately, then appends each new round as it lands.
 */
export function useChain(): ChainState {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [status, setStatus] = useState<ChainState["status"]>("connecting");
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  useEffect(() => {
    const ac = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;

    const withGaps = (raw: Omit<Block, "gap">[]): Block[] =>
      raw.map((b, i) => ({ ...b, gap: i === 0 ? null : b.ts - raw[i - 1].ts }));

    async function seed() {
      const { "last-round": head } = await json<{ "last-round": number }>(
        `${ALGOD}/v2/status`,
        ac.signal
      );
      // one extra so the oldest visible block still gets a measured gap
      const rounds = Array.from({ length: WINDOW + 1 }, (_, i) => head - WINDOW + i);
      const raw = await Promise.all(rounds.map((r) => getBlock(r, ac.signal)));
      raw.sort((a, b) => a.round - b.round);
      latest.current = head;
      setBlocks(withGaps(raw).slice(1));
      setStatus("live");
    }

    async function tick() {
      try {
        const { "last-round": head } = await json<{ "last-round": number }>(
          `${ALGOD}/v2/status`,
          ac.signal
        );
        if (head > latest.current) {
          // Catch up one round at a time; a long tab-background can leave a
          // sizeable gap, and jumping straight to head would invent a fake
          // inter-block delta for the first block back.
          const next = Math.min(head, latest.current + 3);
          const rounds: number[] = [];
          for (let r = latest.current + 1; r <= next; r++) rounds.push(r);
          const fresh = await Promise.all(rounds.map((r) => getBlock(r, ac.signal)));
          latest.current = next;
          setBlocks((prev) => {
            const merged = [...prev.map(({ gap: _gap, ...b }) => b), ...fresh]
              .sort((a, b) => a.round - b.round)
              .slice(-(WINDOW + 1));
            return withGaps(merged).slice(1);
          });
        }
        setStatus("live");
        setError(null);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setStatus("error");
        setError((e as Error).message);
      }
      if (!stopped) timer = setTimeout(tick, 2000);
    }

    seed()
      .then(() => {
        if (!stopped) timer = setTimeout(tick, 2000);
      })
      .catch((e) => {
        if ((e as Error).name === "AbortError") return;
        setStatus("error");
        setError((e as Error).message);
      });

    return () => {
      stopped = true;
      ac.abort();
      clearTimeout(timer);
    };
  }, []);

  return { blocks, status, error };
}

export type UsdcSample = { transfers: number; volume: number; spanSeconds: number } | null;

/** A real slice of USDC movement on Algorand, straight off the indexer. */
export function useUsdc(): { data: UsdcSample; error: string | null } {
  const [data, setData] = useState<UsdcSample>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;

    async function load() {
      try {
        type Txn = {
          "round-time"?: number;
          "asset-transfer-transaction"?: { amount?: number };
        };
        // This endpoint returns results OLDEST-first, so an unbounded query
        // hands back transfers from 2020. Anchor it to the current head.
        const { "last-round": head } = await json<{ "last-round": number }>(
          `${ALGOD}/v2/status`,
          ac.signal
        );
        const d = await json<{ transactions: Txn[] }>(
          `${INDEXER}/v2/assets/${USDC_ASSET}/transactions` +
            `?min-round=${head - RECENT_ROUNDS}&limit=500`,
          ac.signal
        );
        const txns = d.transactions ?? [];
        const times = txns.map((t) => t["round-time"] ?? 0).filter(Boolean);
        const volume = txns.reduce(
          (s, t) => s + (t["asset-transfer-transaction"]?.amount ?? 0),
          0
        );
        setData({
          transfers: txns.length,
          volume: volume / 1e6, // USDC carries 6 decimals
          spanSeconds: times.length > 1 ? Math.max(...times) - Math.min(...times) : 0,
        });
        setError(null);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError((e as Error).message);
      }
      if (!stopped) timer = setTimeout(load, 30_000);
    }

    load();
    return () => {
      stopped = true;
      ac.abort();
      clearTimeout(timer);
    };
  }, []);

  return { data, error };
}

/* ── derived, all measured over the visible window ─────────────────────── */

export function meanGap(blocks: Block[]): number | null {
  const gaps = blocks.map((b) => b.gap).filter((g): g is number => g != null && g > 0);
  return gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null;
}

export function totalTxns(blocks: Block[]): number {
  return blocks.reduce((s, b) => s + b.txns, 0);
}

/** Mean fee actually paid, in ALGO — not the protocol minimum. */
export function meanFee(blocks: Block[]): number | null {
  const withTxns = blocks.filter((b) => b.txns > 0);
  if (!withTxns.length) return null;
  const fees = withTxns.reduce((s, b) => s + b.fees, 0);
  const n = withTxns.reduce((s, b) => s + b.txns, 0);
  return n ? fees / n / 1e6 : null;
}
