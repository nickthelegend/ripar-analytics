# ripar-analytics

**[analytics.ripar.io](https://analytics.ripar.io)** — a live measurement of the
chain Ripar settles on.

Ripar charges per HTTP request, which is only credible if settlement is cheaper
and faster than the call it pays for. Rather than assert that in marketing copy,
this page measures it: the browser reads Algorand's public nodes directly and
every figure comes from blocks that landed while you were looking.

Next.js 16 (App Router) · React 19 · Tailwind v4. One page, no dependencies
beyond the framework.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

No environment variables, no API key, no proxy. AlgoNode's public endpoints
serve `access-control-allow-origin: *`, so the browser talks to MainNet itself
and nothing sits between the reader and the chain that could massage a number
on the way through.

## Real versus sample

This is the one repo here with **no sample data at all**. Two categories of
number appear on the page and the distinction is the whole point of it.

**Measured live, from Algorand MainNet** (`lib/chain.ts`):

- The rolling window of blocks, their round numbers and their arrival times
- Time between blocks, fastest and slowest in the window
- Transactions per block
- Fees actually paid, summed per transaction in microALGO
- A recent sample of USDC (ASA `31566704`) transfers

**Ripar's own numbers, which are zero, and say so on screen:**

Endpoints live `0`, calls settled `0`, USDC routed `0.00`, under the sentence
"No endpoints are deployed yet, so there is nothing here to report." That is
not a placeholder waiting to be filled with something plausible. A dashboard
that invents its own numbers is worth less than no dashboard. When the first
paid endpoint ships, that section fills with counted calls and links to the
transactions that settled them — and not before.

### Two Algorand API traps this file already handles

Both returned convincing-looking garbage before they were found, so do not
undo them:

- `block.fees` is the fee-**sink address**, not a fee total. Summing it yields
  `NaN`. Real fees are per transaction, on `txn.txn.fee`, in microALGO.
- The indexer's `/v2/assets/{id}/transactions` returns results **oldest first**,
  so an unbounded query hands back transfers from 2020. Anchor it with
  `min-round` off the current head.

## Deploy

Vercel, on push to `main`. Production is `analytics.ripar.io`.

```bash
npx vercel --prod        # from this directory, when you need to force one
```

Read [`../CONTRIBUTING.md`](../CONTRIBUTING.md) first — commits must be
authored as the Vercel account email or the deployment sits at `BLOCKED` with
no build logs.

CI (`.github/workflows/ci.yml`) runs `tsc --noEmit` and `next build`. Note that
CI cannot catch a wrong *reading* of the chain: the build is green whether the
fee arithmetic is right or not, so changes to `lib/chain.ts` need a human to
compare the page against [allo.info](https://allo.info).
