import { LiveChain } from "@/components/live-chain";
import { RegistryPanel, RegistryUnavailable } from "@/components/registry-panel";
import { readRegistrySnapshot } from "@/lib/registry";

/**
 * A server component wrapping one client island.
 *
 * The chain measurements are client-side on purpose: the argument they make is
 * "read this yourself from a public node", and a server rendering them would
 * put us back in the middle of it. Ripar's own records go the other way — they
 * are ARC-4 structs in box storage, and decoding those in a browser would ship
 * an SDK to every reader to answer four numbers.
 *
 * Uncached, always. This page describes mutable registries; a build-time read
 * would freeze the agent count at whatever it was on deploy day and present it
 * as current, which is the one thing a page like this must not do.
 */
export const dynamic = "force-dynamic";

export default async function Page() {
  const snapshot = await readRegistrySnapshot().catch((e: unknown) => e as Error);

  return (
    <LiveChain>
      {snapshot instanceof Error ? (
        <RegistryUnavailable message={snapshot.message} />
      ) : (
        <RegistryPanel snapshot={snapshot} />
      )}
    </LiveChain>
  );
}
