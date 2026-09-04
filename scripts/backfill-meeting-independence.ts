/**
 * One-shot backfill for meeting/room decoupling.
 * Run: npx tsx scripts/backfill-meeting-independence.ts
 */
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

async function main() {
  console.log("Decoupling meetings from rooms…");

  // Add new meeting columns if missing (nullable first)
  await sql`
    ALTER TABLE meetings
      ADD COLUMN IF NOT EXISTS slug text,
      ADD COLUMN IF NOT EXISTS title text,
      ADD COLUMN IF NOT EXISTS owner_identity_id uuid,
      ADD COLUMN IF NOT EXISTS board_id text,
      ADD COLUMN IF NOT EXISTS access_policy text DEFAULT 'public',
      ADD COLUMN IF NOT EXISTS livekit_room_name text
  `;

  // Drop old cascade FK and recreate as SET NULL / nullable
  await sql`
    DO $$
    DECLARE
      fk_name text;
    BEGIN
      SELECT tc.constraint_name INTO fk_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_name = 'meetings'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = 'room_id'
      LIMIT 1;
      IF fk_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE meetings DROP CONSTRAINT %I', fk_name);
      END IF;
    END $$
  `;

  await sql`ALTER TABLE meetings ALTER COLUMN room_id DROP NOT NULL`;

  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'meetings' AND constraint_name = 'meetings_room_id_rooms_id_fk'
      ) THEN
        ALTER TABLE meetings
          ADD CONSTRAINT meetings_room_id_rooms_id_fk
          FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL;
      END IF;
    END $$
  `;

  // Backfill meeting fields from rooms
  await sql`
    UPDATE meetings m
    SET
      slug = COALESCE(m.slug, r.slug || '-' || substr(replace(m.id::text, '-', ''), 1, 8)),
      title = COALESCE(m.title, r.title),
      owner_identity_id = COALESCE(m.owner_identity_id, r.owner_identity_id),
      access_policy = COALESCE(m.access_policy, r.access_policy, 'public'),
      livekit_room_name = COALESCE(m.livekit_room_name, r.livekit_room_name),
      board_id = COALESCE(m.board_id, r.board_id)
    FROM rooms r
    WHERE m.room_id = r.id
  `;

  // Orphan meetings without room (should be none) — give synthetic values
  await sql`
    UPDATE meetings
    SET
      slug = COALESCE(slug, 'm-' || substr(replace(id::text, '-', ''), 1, 10)),
      title = COALESCE(title, 'Meeting'),
      owner_identity_id = COALESCE(
        owner_identity_id,
        (SELECT id FROM chronos_identities ORDER BY created_at ASC LIMIT 1)
      ),
      access_policy = COALESCE(access_policy, 'public'),
      livekit_room_name = COALESCE(livekit_room_name, 'meet_' || substr(replace(id::text, '-', ''), 1, 10))
    WHERE slug IS NULL OR title IS NULL OR owner_identity_id IS NULL OR livekit_room_name IS NULL
  `;

  // Ensure unique slugs
  await sql`
    WITH dups AS (
      SELECT id, slug, ROW_NUMBER() OVER (PARTITION BY slug ORDER BY started_at) AS rn
      FROM meetings
    )
    UPDATE meetings m
    SET slug = m.slug || '-' || substr(replace(m.id::text, '-', ''), 1, 6)
    FROM dups d
    WHERE m.id = d.id AND d.rn > 1
  `;

  await sql`ALTER TABLE meetings ALTER COLUMN slug SET NOT NULL`;
  await sql`ALTER TABLE meetings ALTER COLUMN title SET NOT NULL`;
  await sql`ALTER TABLE meetings ALTER COLUMN owner_identity_id SET NOT NULL`;
  await sql`ALTER TABLE meetings ALTER COLUMN access_policy SET NOT NULL`;
  await sql`ALTER TABLE meetings ALTER COLUMN livekit_room_name SET NOT NULL`;

  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'meetings' AND constraint_name = 'meetings_owner_identity_id_chronos_identities_id_fk'
      ) THEN
        ALTER TABLE meetings
          ADD CONSTRAINT meetings_owner_identity_id_chronos_identities_id_fk
          FOREIGN KEY (owner_identity_id) REFERENCES chronos_identities(id);
      END IF;
    END $$
  `;

  await sql`CREATE UNIQUE INDEX IF NOT EXISTS meetings_slug_uidx ON meetings(slug)`;
  await sql`CREATE INDEX IF NOT EXISTS meetings_owner_idx ON meetings(owner_identity_id)`;
  await sql`CREATE INDEX IF NOT EXISTS meetings_livekit_idx ON meetings(livekit_room_name)`;

  // meeting_brands table
  await sql`
    CREATE TABLE IF NOT EXISTS meeting_brands (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      meeting_id uuid NOT NULL UNIQUE REFERENCES meetings(id) ON DELETE CASCADE,
      logo_url text,
      wordmark text,
      theme_preset text DEFAULT 'violet',
      primary_color text DEFAULT '#8b5cf6',
      secondary_color text DEFAULT '#a78bfa',
      tertiary_color text DEFAULT '#d946ef',
      font_family text DEFAULT 'Inter, system-ui, sans-serif',
      background text DEFAULT '#0b1020',
      lobby_title text,
      lobby_subtitle text,
      favicon_url text,
      custom_css text,
      primary_paint jsonb,
      secondary_paint jsonb,
      tertiary_paint jsonb,
      background_paint jsonb,
      pattern_url text,
      pattern_size_mode text DEFAULT 'percent',
      pattern_size integer DEFAULT 24,
      pattern_tint text DEFAULT 'none',
      pattern_tint_color text,
      pattern_tint_opacity integer DEFAULT 55,
      bg_animation text DEFAULT 'none',
      bg_animation_speed integer DEFAULT 3,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  await sql`
    INSERT INTO meeting_brands (
      meeting_id, logo_url, wordmark, theme_preset, primary_color, secondary_color,
      tertiary_color, font_family, background, lobby_title, lobby_subtitle, favicon_url,
      custom_css, primary_paint, secondary_paint, tertiary_paint, background_paint,
      pattern_url, pattern_size_mode, pattern_size, pattern_tint, pattern_tint_color,
      pattern_tint_opacity, bg_animation, bg_animation_speed
    )
    SELECT
      m.id, rb.logo_url, rb.wordmark, rb.theme_preset, rb.primary_color, rb.secondary_color,
      rb.tertiary_color, rb.font_family, rb.background, rb.lobby_title, rb.lobby_subtitle, rb.favicon_url,
      rb.custom_css, rb.primary_paint, rb.secondary_paint, rb.tertiary_paint, rb.background_paint,
      rb.pattern_url, rb.pattern_size_mode, rb.pattern_size, rb.pattern_tint, rb.pattern_tint_color,
      rb.pattern_tint_opacity, rb.bg_animation, rb.bg_animation_speed
    FROM meetings m
    JOIN room_brands rb ON rb.room_id = m.room_id
    WHERE NOT EXISTS (SELECT 1 FROM meeting_brands mb WHERE mb.meeting_id = m.id)
  `;

  // Default brand for meetings without room brand
  await sql`
    INSERT INTO meeting_brands (meeting_id, wordmark, lobby_title, lobby_subtitle)
    SELECT m.id, m.title, m.title, 'Powered by Chronos Meet'
    FROM meetings m
    WHERE NOT EXISTS (SELECT 1 FROM meeting_brands mb WHERE mb.meeting_id = m.id)
  `;

  // join_requests: add meeting_id
  await sql`ALTER TABLE join_requests ADD COLUMN IF NOT EXISTS meeting_id uuid`;

  await sql`
    UPDATE join_requests jr
    SET meeting_id = sub.id
    FROM (
      SELECT DISTINCT ON (room_id) id, room_id
      FROM meetings
      ORDER BY room_id, started_at DESC
    ) sub
    WHERE jr.room_id = sub.room_id AND jr.meeting_id IS NULL
  `;

  // Drop join requests that cannot be mapped
  await sql`DELETE FROM join_requests WHERE meeting_id IS NULL`;

  await sql`
    DO $$
    DECLARE
      fk_name text;
    BEGIN
      SELECT tc.constraint_name INTO fk_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_name = 'join_requests'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = 'room_id'
      LIMIT 1;
      IF fk_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE join_requests DROP CONSTRAINT %I', fk_name);
      END IF;
    END $$
  `;

  await sql`ALTER TABLE join_requests ALTER COLUMN room_id DROP NOT NULL`;
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'join_requests' AND constraint_name = 'join_requests_room_id_rooms_id_fk'
      ) THEN
        ALTER TABLE join_requests
          ADD CONSTRAINT join_requests_room_id_rooms_id_fk
          FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL;
      END IF;
    END $$
  `;

  await sql`ALTER TABLE join_requests ALTER COLUMN meeting_id SET NOT NULL`;
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'join_requests' AND constraint_name = 'join_requests_meeting_id_meetings_id_fk'
      ) THEN
        ALTER TABLE join_requests
          ADD CONSTRAINT join_requests_meeting_id_meetings_id_fk
          FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE;
      END IF;
    END $$
  `;

  await sql`CREATE INDEX IF NOT EXISTS join_requests_meeting_idx ON join_requests(meeting_id)`;
  await sql`CREATE INDEX IF NOT EXISTS join_requests_meeting_status_idx ON join_requests(meeting_id, status)`;

  console.log("Backfill complete.");
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
