import postgres from "postgres";
async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS meeting_brands_meeting_id_unique ON meeting_brands(meeting_id)`;
  console.log("ok");
  await sql.end();
}
main();
