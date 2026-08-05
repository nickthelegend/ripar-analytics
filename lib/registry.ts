/**
 * Ripar's own numbers, read off Algorand TestNet on the server.
 *
 * `lib/chain.ts` measures the CHAIN — MainNet cadence, fees, USDC movement —
 * from the browser, because that argument is about whether Algorand is fast and
 * cheap enough for per-call payments. This file answers a different question:
 * what has actually happened to Ripar. The three ERC-8004 registries are
 * deployed to TestNet and nowhere else, so this reads TestNet, and it reads it
 * server-side because decoding a box needs algosdk's ARC-4 decoder and there is
 * no reason to ship that to a browser.
 *
 * The rule the whole file is built around: EVERY POINT IS AN OBSERVATION. No
 * series is padded to a nice length, no gap is interpolated, no bucket is
 * invented to make a line look continuous. A series with two points is reported
 * as two points, and the components say so out loud, because the alternative —
 * a smooth curve drawn through two facts and a lot of wishful thinking — is how
 * a dashboard starts lying.
 */

import algosdk from "algosdk";

const { ABIType, encodeAddress } = algosdk;

export const TESTNET_ALGOD = "https://testnet-api.algonode.cloud";
export const TESTNET_INDEXER = "https://testnet-idx.algonode.cloud";
export const LORA = "https://lora.algokit.io/testnet";

/**
 * The three registries, redeployed 4 Aug 2026 after an audit closed three
 * authorisation holes. Kept in step with `ripar-explorer/lib/registries.ts`;
 * if the two ever disagree, the boxes are the tiebreak.
 */
export const REGISTRIES = {
  identity: 768_633_998,
  reputation: 768_633_999,
  validation: 768_634_000,
} as const;

/**
 * The asset the ReputationRegistry counts, fixed at its bootstrap.
 *
 * NOT circulating TestNet USDC. `USDC` was minted for this deployment because
 * the TestNet USDC faucet is behind a login, and a settlement asset nobody can
 * obtain means no settlements to measure. The substitution is deliberate and it
 * is named as `USDC` everywhere rather than shown as USDC.
 */
export const SETTLEMENT_ASSET = {
  id: 10_458_941,
  unitName: "USDC",
  name: "USDC",
  decimals: 6,
} as const;

const BOX_PREFIX = { agents: "ag_", scores: "sc_", jobs: "jb_", escrow: "es_" } as const;

/* ── ARC-4 layouts, transcribed from the contracts' ARC-56 specs ───────── */

// These structs carry dynamic members — a domain is a `string`, a spec hash is
// a `byte[]` — so their fields do NOT sit at fixed offsets. `AgentInfo` is five
// fields but its head is 58 bytes, with the domain's text in a tail addressed
// by a 2-byte offset. Slicing at hand-counted offsets reads an agent's domain
// out of the middle of its address; algosdk resolves them properly.
const AGENT_INFO = "(uint64,string,address,uint64,uint64)";
const SCORE = "(uint64,uint64,uint64,uint64,uint64,uint64,uint64)";
const JOB = "(uint64,address,uint64,uint64,uint64,byte[],byte[],uint64,uint64,uint64)";

const num = (v: unknown) => Number(v as bigint);

const addr = (v: unknown): string =>
  typeof v === "string" ? v : v instanceof Uint8Array ? encodeAddress(v) : String(v);

/* ── transport ─────────────────────────────────────────────────────────── */

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText || "error"} from ${new URL(url).host}`);
  return (await res.json()) as T;
}

const b64ToBytes = (s: string) => new Uint8Array(Buffer.from(s, "base64"));
const bytesToB64 = (b: Uint8Array) => Buffer.from(b).toString("base64");

async function listBoxNames(appId: number, prefix: string): Promise<Uint8Array[]> {
  const body = await get<{ boxes?: Array<{ name?: string }> }>(
    `${TESTNET_ALGOD}/v2/applications/${appId}/boxes`,
  );
  const want = new TextEncoder().encode(prefix);
  const out: Uint8Array[] = [];
  for (const box of body.boxes ?? []) {
    if (!box.name) continue;
    const name = b64ToBytes(box.name);
    if (name.length === want.length + 8 && want.every((b, i) => name[i] === b)) out.push(name);
  }
  return out;
}

async function readBox(appId: number, name: Uint8Array): Promise<Uint8Array | null> {
  const res = await fetch(
    `${TESTNET_ALGOD}/v2/applications/${appId}/box?name=b64:${encodeURIComponent(bytesToB64(name))}`,
    { cache: "no-store" },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${res.status} reading a box on app ${appId}`);
  const body = (await res.json()) as { value?: string };
  return body.value ? b64ToBytes(body.value) : null;
}

/* ── what the registries hold ──────────────────────────────────────────── */

export type Agent = { agentId: number; domain: string; address: string; registeredAt: number };
export type Score = { agentId: number; jobsPaid: number; volumeMicro: number; validated: number; disputed: number };
export type Job = { jobId: number; budgetMicro: number; status: number; createdAt: number; serverAgentId: number };

export type Settlement = {
  txId: string;
  timestamp: number;
  round: number;
  sender: string;
  receiver: string;
  amountMicro: number;
};

async function readAgents(): Promise<Agent[]> {
  const names = await listBoxNames(REGISTRIES.identity, BOX_PREFIX.agents);
  const values = await Promise.all(names.map((n) => readBox(REGISTRIES.identity, n)));
  return values
    .filter((v): v is Uint8Array => v !== null)
    .map((raw) => {
      const t = ABIType.from(AGENT_INFO).decode(raw) as unknown[];
      return { agentId: num(t[0]), domain: String(t[1]), address: addr(t[2]), registeredAt: num(t[3]) };
    })
    .sort((a, b) => a.registeredAt - b.registeredAt || a.agentId - b.agentId);
}

async function readScores(): Promise<Score[]> {
  const names = await listBoxNames(REGISTRIES.reputation, BOX_PREFIX.scores);
  const values = await Promise.all(names.map((n) => readBox(REGISTRIES.reputation, n)));
  return values
    .filter((v): v is Uint8Array => v !== null)
    .map((raw) => {
      const t = ABIType.from(SCORE).decode(raw) as unknown[];
      return {
        agentId: num(t[0]),
        jobsPaid: num(t[1]),
        volumeMicro: num(t[2]),
        validated: num(t[3]),
        disputed: num(t[4]),
      };
    });
}

async function readJobs(): Promise<Job[]> {
  const names = await listBoxNames(REGISTRIES.validation, BOX_PREFIX.jobs);
  const values = await Promise.all(names.map((n) => readBox(REGISTRIES.validation, n)));
  return values
    .filter((v): v is Uint8Array => v !== null)
    .map((raw) => {
      const t = ABIType.from(JOB).decode(raw) as unknown[];
      return { jobId: num(t[0]), serverAgentId: num(t[2]), budgetMicro: num(t[4]), status: num(t[7]), createdAt: num(t[8]) };
    })
    .sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Every transfer of the settlement asset, oldest first.
 *
 * The asset endpoint returns results OLDEST-first and paginates by cursor;
 * `limit` is a page size, not a cap on the answer, so the cursor is followed to
 * the end rather than assuming one page is the whole story. The page budget is
 * a guard against an unbounded loop, and hitting it throws — a short list that
 * looks complete is the one failure this file must not produce.
 */
async function readAssetTransfers(maxPages = 10, pageSize = 1000): Promise<Settlement[]> {
  const out: Settlement[] = [];
  let next: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const body = await get<{
      transactions?: Array<{
        id?: string;
        sender?: string;
        "confirmed-round"?: number;
        "round-time"?: number;
        "asset-transfer-transaction"?: { amount?: number; receiver?: string };
      }>;
      "next-token"?: string;
    }>(
      `${TESTNET_INDEXER}/v2/assets/${SETTLEMENT_ASSET.id}/transactions` +
        `?tx-type=axfer&limit=${pageSize}${next ? `&next=${encodeURIComponent(next)}` : ""}`,
    );

    for (const t of body.transactions ?? []) {
      const x = t["asset-transfer-transaction"];
      const amountMicro = Number(x?.amount ?? 0);
      // A zero-unit transfer is an opt-in. It is a real transaction and it is
      // not a settlement; counting it would put a payment on the chart that
      // paid for nothing.
      if (!t.id || !x || amountMicro <= 0) continue;
      out.push({
        txId: t.id,
        timestamp: Number(t["round-time"] ?? 0),
        round: Number(t["confirmed-round"] ?? 0),
        sender: t.sender ?? "",
        receiver: x.receiver ?? "",
        amountMicro,
      });
    }

    next = body["next-token"];
    if (!next || (body.transactions ?? []).length === 0) {
      return out.sort((a, b) => a.timestamp - b.timestamp || a.round - b.round);
    }
  }

  throw new Error(
    `The settlement-asset transfer list did not finish within ${maxPages} pages; refusing to chart a partial list as a complete one`,
  );
}

/* ── series ────────────────────────────────────────────────────────────── */

/**
 * A time series and, always, how many observations are behind it.
 *
 * The count travels with the data rather than being recovered from
 * `points.length` at the call site, because the honest empty state is a
 * function of it and a component that forgets to check draws a chart from one
 * point.
 */
export type Series = {
  points: Array<{ t: number; v: number; label?: string }>;
  observations: number;
  /** Seconds between the first and last observation. 0 when they coincide. */
  spanSeconds: number;
};

function toSeries(points: Array<{ t: number; v: number; label?: string }>): Series {
  const ts = points.map((p) => p.t).filter((t) => t > 0);
  return {
    points,
    observations: points.length,
    spanSeconds: ts.length > 1 ? Math.max(...ts) - Math.min(...ts) : 0,
  };
}

export type RegistrySnapshot = {
  readAt: number;
  round: number | null;
  agents: Agent[];
  scores: Score[];
  jobs: Job[];
  /** Transfers where BOTH ends are addresses registered in the IdentityRegistry. */
  settlements: Settlement[];
  /** Transfers of the same asset where at least one end is not a registered agent. */
  offRegistryTransfers: number;
  series: {
    /** One point per settlement, value = amount. Not bucketed. */
    settlements: Series;
    /** Running total of settled base units, one point per settlement. */
    cumulativeVolume: Series;
    /** Running count of registered agents, one point per registration. */
    agentsRegistered: Series;
  };
  totals: {
    settledMicro: number;
    creditedPayments: number;
    creditedMicro: number;
    jobsValidated: number;
    jobsDisputed: number;
    budgetStatedMicro: number;
  };
};

/**
 * Everything, read at request time. Throws rather than degrading: a page that
 * quietly falls back to an empty chart is indistinguishable from a protocol
 * with no activity, and those are opposite claims.
 */
export async function readRegistrySnapshot(): Promise<RegistrySnapshot> {
  const [agents, scores, jobs, transfers, status] = await Promise.all([
    readAgents(),
    readScores(),
    readJobs(),
    readAssetTransfers(),
    get<{ "last-round"?: number }>(`${TESTNET_ALGOD}/v2/status`).catch(() => ({ "last-round": undefined })),
  ]);

  // "A settlement" is defined here, once, and stated on the page: a transfer of
  // the settlement asset between two addresses the IdentityRegistry knows. That
  // excludes the mint and the faucet top-up, which moved real units between
  // real accounts and paid no agent for anything.
  const registered = new Set(agents.map((a) => a.address));
  const settlements = transfers.filter((t) => registered.has(t.sender) && registered.has(t.receiver));
  const offRegistryTransfers = transfers.length - settlements.length;

  let running = 0;
  const cumulative = settlements.map((s) => {
    running += s.amountMicro;
    return { t: s.timestamp, v: running, label: s.txId };
  });

  return {
    readAt: Math.floor(Date.now() / 1000),
    round: status["last-round"] ?? null,
    agents,
    scores,
    jobs,
    settlements,
    offRegistryTransfers,
    series: {
      settlements: toSeries(settlements.map((s) => ({ t: s.timestamp, v: s.amountMicro, label: s.txId }))),
      cumulativeVolume: toSeries(cumulative),
      agentsRegistered: toSeries(
        agents.map((a, i) => ({ t: a.registeredAt, v: i + 1, label: a.domain })),
      ),
    },
    totals: {
      settledMicro: settlements.reduce((sum, s) => sum + s.amountMicro, 0),
      creditedPayments: scores.reduce((sum, s) => sum + s.jobsPaid, 0),
      creditedMicro: scores.reduce((sum, s) => sum + s.volumeMicro, 0),
      jobsValidated: jobs.filter((j) => j.status === 3).length,
      jobsDisputed: jobs.filter((j) => j.status === 4).length,
      budgetStatedMicro: jobs.filter((j) => j.status !== 5).reduce((sum, j) => sum + j.budgetMicro, 0),
    },
  };
}

/* ── formatting ────────────────────────────────────────────────────────── */

export const units = (micro: number) => micro / 10 ** SETTLEMENT_ASSET.decimals;

export function amount(micro: number): string {
  const v = units(micro);
  // Six decimals matter at sub-cent prices and are noise at ten units.
  const decimals = v !== 0 && Math.abs(v) < 1 ? 6 : 2;
  return v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function duration(seconds: number): string {
  if (seconds <= 0) return "no elapsed time";
  if (seconds < 90) return `${seconds}s`;
  if (seconds < 5400) return `${(seconds / 60).toFixed(seconds < 600 ? 1 : 0)} min`;
  if (seconds < 172_800) return `${(seconds / 3600).toFixed(1)} hours`;
  return `${(seconds / 86_400).toFixed(1)} days`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function stamp(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}
