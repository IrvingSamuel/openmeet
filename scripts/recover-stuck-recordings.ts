/**
 * Finish Egress recordings stuck in `uploading` and send their
 * `recording.ready` webhook. Run after `ALTER TABLE recordings ALTER COLUMN
 * bytes TYPE bigint` on installs that recorded meetings over ~1h40.
 * Usage: npx tsx scripts/recover-stuck-recordings.ts
 */
import { recoverStuckEgressRecordings } from "../src/lib/recording";

async function main() {
  const result = await recoverStuckEgressRecordings();
  console.log(JSON.stringify(result, null, 2));
  // Webhook dispatch is fire-and-forget; give it a moment before exiting.
  await new Promise((resolve) => setTimeout(resolve, 5_000));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
