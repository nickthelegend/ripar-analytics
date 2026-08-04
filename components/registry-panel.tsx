/**
 * Ripar's own record, from box storage on Algorand TestNet.
 *
 * This section used to read "No endpoints are deployed yet, so there is nothing
 * here to report", with three hardcoded zeros under it. That was true when it
 * was written and is not any more, and a hardcoded zero is exactly as false as
 * a hardcoded thousand. Everything below is decoded from a box or read off the
 * indexer at request time.
 *
 * The figures are deliberately small and are shown at their real size. There is
 * no percentage anywhere on this page, because a percentage over a handful of
 * observations is a way of making a handful sound like a trend.
 */

import {
  LORA,
  REGISTRIES,
  SETTLEMENT_ASSET,
  amount,
  duration,
  stamp,
  units,
  type RegistrySnapshot,
} from "@/lib/registry";
import { CumulativeChart, EventChart } from "@/components/series-chart";

function Out({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="font-mono underline underline-offset-2 hover:text-[var(--brand)]"
    >
      {children}
    </a>
  );
}

function Figure({ label, value, unit, note }: { label: string; value: string; unit?: string; note: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[13px]" style={{ color: "var(--ink-3)" }}>
        {label}
      </dt>
      <dd className="tnum mt-1 flex items-baseline gap-1.5 font-mono text-[20px]">
        <span>{value}</span>
        {unit && (
          <span className="font-sans text-[12px]" style={{ color: "var(--ink-3)" }}>
            {unit}
          </span>
        )}
      </dd>
      <p className="mt-1.5 max-w-[34ch] text-[12px] leading-snug" style={{ color: "var(--ink-3)" }}>
        {note}
      </p>
    </div>
  );
}

export function RegistryPanel({ snapshot }: { snapshot: RegistrySnapshot }) {
  const { series, totals, agents, jobs, settlements, offRegistryTransfers, round } = snapshot;

  const firstSettlement = settlements[0];
  const firstAgent = agents[0];

  return (
    <section className="border-t py-12" style={{ borderColor: "var(--line)" }}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[15px] font-semibold tracking-tight">Ripar on Algorand TestNet</h2>
        <span className="tnum font-mono text-[12px]" style={{ color: "var(--ink-3)" }}>
          {round ? `read at round ${round.toLocaleString("en-US")}` : "read at request time"}
        </span>
      </div>
      <p className="mt-2 max-w-[68ch] text-[13.5px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
        The three ERC-8004 registries are deployed to TestNet and nowhere else, so this section reads TestNet
        while everything above reads MainNet. Identity is app{" "}
        <Out href={`${LORA}/application/${REGISTRIES.identity}`}>{REGISTRIES.identity}</Out>, reputation{" "}
        <Out href={`${LORA}/application/${REGISTRIES.reputation}`}>{REGISTRIES.reputation}</Out>, validation{" "}
        <Out href={`${LORA}/application/${REGISTRIES.validation}`}>{REGISTRIES.validation}</Out>. Every number
        here is decoded from one of their boxes.
      </p>

      <dl className="mt-8 grid gap-x-10 gap-y-7 sm:grid-cols-2 lg:grid-cols-4">
        <Figure
          label="Agents registered"
          value={agents.length.toLocaleString("en-US")}
          note={`ag_ boxes in the Identity Registry, one per agent`}
        />
        <Figure
          label="Settlements between agents"
          value={settlements.length.toLocaleString("en-US")}
          note={`transfers of ${SETTLEMENT_ASSET.unitName} where both ends are registered addresses`}
        />
        <Figure
          label={`${SETTLEMENT_ASSET.unitName} settled`}
          value={amount(totals.settledMicro)}
          unit={SETTLEMENT_ASSET.unitName}
          note="summed from the transfers themselves, not from any stored total"
        />
        <Figure
          label="Credited to reputation"
          value={totals.creditedPayments.toLocaleString("en-US")}
          note={`of those settlements, the number accept_feedback has turned into score — ${amount(
            totals.creditedMicro,
          )} ${SETTLEMENT_ASSET.unitName}`}
        />
      </dl>

      {/* Two counts of the same money that do not have to agree, and why. */}
      {settlements.length !== totals.creditedPayments && (
        <p
          className="mt-6 max-w-[72ch] rounded-lg border px-4 py-3 text-[12.5px] leading-relaxed"
          style={{ borderColor: "var(--line)", background: "var(--panel)", color: "var(--ink-2)" }}
        >
          Those last two figures differ, and the difference is not an error. A transfer proves money moved; a
          score records that someone called <span className="font-mono">accept_feedback</span> with that
          transfer inside the same atomic group. Nothing on a transfer says whether that happened, and the
          registry keeps no per-payment ledger to reconcile against — so both counts are reported as they are
          rather than one being adjusted to match the other.
        </p>
      )}

      <div className="mt-12 grid gap-12 lg:grid-cols-2 lg:gap-x-14">
        <EventChart
          series={series.settlements}
          title={`Settlements over time`}
          definition={`Each mark is one ${SETTLEMENT_ASSET.unitName} transfer between two addresses the Identity Registry knows, at the block time it confirmed. Opt-ins and the initial mint are excluded — a zero-unit transfer is not a payment, and the faucet top-up paid no agent for anything.`}
          noun="settlement"
          format={(v) => `${amount(v)}`}
          single={firstSettlement ? `${amount(firstSettlement.amountMicro)} ${SETTLEMENT_ASSET.unitName} at ${stamp(firstSettlement.timestamp)}` : undefined}
        />

        <CumulativeChart
          series={series.cumulativeVolume}
          title={`Cumulative ${SETTLEMENT_ASSET.unitName} settled`}
          definition="A running total of the same transfers. It steps rather than curves because that is what a running total does: it is flat between settlements and jumps at one, and a smooth line would imply growth in the gaps where nothing was recorded."
          noun="settlement"
          format={(v) => amount(v)}
          single={firstSettlement ? `${amount(firstSettlement.amountMicro)} ${SETTLEMENT_ASSET.unitName}` : undefined}
        />

        <CumulativeChart
          series={series.agentsRegistered}
          title="Agents registered over time"
          definition="A running count of ag_ boxes, positioned by each agent's registered_at — a timestamp the contract took from the block, not from the client."
          noun="registration"
          format={(v) => String(Math.round(v))}
          single={firstAgent ? `${firstAgent.domain}, ${stamp(firstAgent.registeredAt)}` : undefined}
        />

        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold tracking-tight">What is not plotted, and why</h3>
          <ul className="mt-3 space-y-3 text-[13px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
            <li>
              <strong style={{ color: "var(--ink)" }}>No rate, no average, no percentage.</strong> Over{" "}
              {settlements.length} settlement{settlements.length === 1 ? "" : "s"} spanning{" "}
              {duration(series.settlements.spanSeconds)}, a &ldquo;settlements per day&rdquo; figure would be
              arithmetic performed on noise.
            </li>
            <li>
              <strong style={{ color: "var(--ink)" }}>No buckets.</strong> Nothing is grouped into hours or
              days, because an empty bucket drawn as zero asserts that nothing happened in that window —
              a stronger claim than &ldquo;there is no observation here&rdquo;.
            </li>
            <li>
              <strong style={{ color: "var(--ink)" }}>
                {offRegistryTransfers} transfer{offRegistryTransfers === 1 ? "" : "s"} of the same asset{" "}
                {offRegistryTransfers === 1 ? "is" : "are"} excluded.
              </strong>{" "}
              {offRegistryTransfers > 0
                ? `Each moved ${SETTLEMENT_ASSET.unitName} with at least one end that is not an address in the Identity Registry — topping an account up, or moving into the Validation Registry's escrow, are both of that shape. What they were individually is not asserted here; what is asserted is the rule that excluded them, which is checkable against the same box list.`
                : `Every transfer of the asset so far has been between two registered agents.`}
            </li>
            <li>
              <strong style={{ color: "var(--ink)" }}>Jobs are counted, not charted.</strong> The Validation
              Registry holds {jobs.length} job{jobs.length === 1 ? "" : "s"} — {totals.jobsValidated}{" "}
              validated, {totals.jobsDisputed} disputed, stating{" "}
              {amount(totals.budgetStatedMicro)} {SETTLEMENT_ASSET.unitName} of budget between them. A budget
              is a number a client wrote down, not a balance the contract holds, so it is never summed into
              the settled figure above.
            </li>
          </ul>
        </div>
      </div>

      <p className="mt-10 max-w-[72ch] text-[12.5px] leading-relaxed" style={{ color: "var(--ink-3)" }}>
        Settlement is denominated in{" "}
        <Out href={`${LORA}/asset/${SETTLEMENT_ASSET.id}`}>
          {SETTLEMENT_ASSET.unitName} · {SETTLEMENT_ASSET.id}
        </Out>
        , not circulating TestNet USDC. It was minted for this deployment because the TestNet USDC faucet is
        behind a login, and a settlement asset nobody can obtain means no settlements to measure. It carries
        six decimals like USDC and is named {SETTLEMENT_ASSET.unitName} everywhere here so the{" "}
        <span className="tnum">{amount(totals.settledMicro)}</span> above is never mistaken for dollars. The
        full agent, job and settlement records are on{" "}
        <a
          href="https://explorer.ripar.io/registry"
          className="underline underline-offset-2 hover:text-[var(--ink)]"
        >
          the explorer
        </a>
        .
      </p>
    </section>
  );
}

/**
 * A registry read that failed says so and stops. An empty chart in its place
 * would be indistinguishable from a protocol on which nothing has happened,
 * and those are opposite claims about the same page.
 */
export function RegistryUnavailable({ message }: { message: string }) {
  return (
    <section className="border-t py-12" style={{ borderColor: "var(--line)" }}>
      <h2 className="text-[15px] font-semibold tracking-tight">Ripar on Algorand TestNet</h2>
      <div
        className="mt-5 rounded-xl border p-6 sm:p-8"
        style={{ borderColor: "var(--line)", background: "var(--panel)" }}
      >
        <p className="max-w-[62ch] text-[15px] leading-relaxed">
          The registries could not be read just now, so this section is showing nothing rather than zeros.
        </p>
        <p className="mt-3 font-mono text-[13px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
          {message}
        </p>
        <p className="mt-3 max-w-[62ch] text-[13.5px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
          Nothing here is cached or estimated. A zero on this page would be a claim that no agent has
          registered and nothing has settled, which is a different statement from &ldquo;the node did not
          answer&rdquo;. The boxes remain readable from any Algorand node —{" "}
          <Out href={`${LORA}/application/${REGISTRIES.identity}`}>application {REGISTRIES.identity}</Out>.
        </p>
      </div>
    </section>
  );
}

/** Kept beside the panel so both spellings of an amount live in one file. */
export const displayUnits = units;
