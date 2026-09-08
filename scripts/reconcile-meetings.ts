/**
 * Expire stale meetings and reconcile active rows with LiveKit.
 * Usage: npx tsx scripts/reconcile-meetings.ts
 */
import { reconcileAndExpireMeetings } from "../src/lib/meeting-lifecycle";

async function main() {
  const result = await reconcileAndExpireMeetings();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
