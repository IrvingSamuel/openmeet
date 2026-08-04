import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  jsonb,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const chronosIdentities = pgTable(
  "chronos_identities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    chronosUserId: text("chronos_user_id").notNull(),
    email: text("email"),
    name: text("name"),
    avatarUrl: text("avatar_url"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    mcpToken: text("mcp_token"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("chronos_identities_user_uidx").on(t.chronosUserId)],
);

export const rooms = pgTable(
  "rooms",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    ownerIdentityId: uuid("owner_identity_id")
      .notNull()
      .references(() => chronosIdentities.id),
    boardId: text("board_id"),
    accessPolicy: text("access_policy").notNull().default("members"), // public | members | invite
    livekitRoomName: text("livekit_room_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("rooms_slug_uidx").on(t.slug),
    index("rooms_board_idx").on(t.boardId),
  ],
);

export const roomBrands = pgTable("room_brands", {
  id: uuid("id").defaultRandom().primaryKey(),
  roomId: uuid("room_id")
    .notNull()
    .references(() => rooms.id, { onDelete: "cascade" })
    .unique(),
  logoUrl: text("logo_url"),
  wordmark: text("wordmark"),
  themePreset: text("theme_preset").default("indigo"),
  primaryColor: text("primary_color").default("#6366f1"),
  secondaryColor: text("secondary_color").default("#22d3ee"),
  tertiaryColor: text("tertiary_color").default("#a855f7"),
  fontFamily: text("font_family").default("Inter, system-ui, sans-serif"),
  background: text("background").default("#0b1020"),
  lobbyTitle: text("lobby_title"),
  lobbySubtitle: text("lobby_subtitle"),
  faviconUrl: text("favicon_url"),
  customCss: text("custom_css"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const meetings = pgTable(
  "meetings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    livekitRoomSid: text("livekit_room_sid"),
    status: text("status").notNull().default("active"), // active | ended
    /** pending | running | ready | failed — guards single summary generation */
    summaryStatus: text("summary_status").notNull().default("pending"),
    /** Cached live insights payload (JSON) — avoids Gemini on every panel open. */
    insightsCache: jsonb("insights_cache"),
    insightsCacheSegmentCount: integer("insights_cache_segment_count"),
    insightsCacheAt: timestamp("insights_cache_at", { withTimezone: true }),
    insightsRegenCount: integer("insights_regen_count").notNull().default(0),
  },
  (t) => [index("meetings_room_idx").on(t.roomId)],
);

export const participants = pgTable(
  "participants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    identityId: uuid("identity_id").references(() => chronosIdentities.id),
    displayName: text("display_name").notNull(),
    role: text("role").notNull().default("participant"), // host | participant | agent
    livekitIdentity: text("livekit_identity").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
    leftAt: timestamp("left_at", { withTimezone: true }),
  },
  (t) => [index("participants_meeting_idx").on(t.meetingId)],
);

/** Waiting-room queue for accessPolicy === "invite". */
export const joinRequests = pgTable(
  "join_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    identityId: uuid("identity_id").references(() => chronosIdentities.id),
    clientInstanceId: text("client_instance_id").notNull(),
    status: text("status").notNull().default("pending"), // pending | approved | denied | cancelled | consumed
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [
    index("join_requests_room_idx").on(t.roomId),
    index("join_requests_room_status_idx").on(t.roomId, t.status),
  ],
);

export const transcriptSegments = pgTable(
  "transcript_segments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id").references(() => participants.id),
    speakerLabel: text("speaker_label").notNull(),
    text: text("text").notNull(),
    isFinal: boolean("is_final").notNull().default(true),
    startedAtMs: integer("started_at_ms"),
    endedAtMs: integer("ended_at_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("transcript_meeting_idx").on(t.meetingId)],
);

export const meetingSummaries = pgTable("meeting_summaries", {
  id: uuid("id").defaultRandom().primaryKey(),
  meetingId: uuid("meeting_id")
    .notNull()
    .references(() => meetings.id, { onDelete: "cascade" })
    .unique(),
  summaryMarkdown: text("summary_markdown").notNull(),
  model: text("model"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const actionItems = pgTable("action_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  meetingId: uuid("meeting_id")
    .notNull()
    .references(() => meetings.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  assigneeHint: text("assignee_hint"),
  chronosTaskId: text("chronos_task_id"),
  chronosBoardId: text("chronos_board_id"),
  status: text("status").notNull().default("pending"), // pending | created | failed
  raw: jsonb("raw"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    livekitIdentity: text("livekit_identity").notNull(),
    displayName: text("display_name").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("chat_messages_meeting_idx").on(t.meetingId)],
);

export const copilotChatMessages = pgTable(
  "copilot_chat_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // user | assistant
    body: text("body").notNull(),
    authorName: text("author_name"),
    authorIdentity: text("author_identity"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("copilot_chat_messages_meeting_idx").on(t.meetingId)],
);

export const recordings = pgTable("recordings", {
  id: uuid("id").defaultRandom().primaryKey(),
  meetingId: uuid("meeting_id")
    .notNull()
    .references(() => meetings.id, { onDelete: "cascade" }),
  storageUrl: text("storage_url"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Singleton system settings for self-hosted admin (AI keys, locale, webhooks). */
export const APP_SETTINGS_ROW_ID = "00000000-0000-0000-0000-000000000001";

export type WebhookEventsConfig = {
  transcript: boolean;
  chat: boolean;
  summary: boolean;
  tasks: boolean;
};

export const DEFAULT_WEBHOOK_EVENTS: WebhookEventsConfig = {
  transcript: true,
  chat: true,
  summary: true,
  tasks: true,
};

export const appSettings = pgTable("app_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  locale: text("locale").notNull().default("pt-BR"),
  geminiApiKey: text("gemini_api_key"),
  geminiModel: text("gemini_model"),
  geminiSummaryModel: text("gemini_summary_model"),
  deepgramApiKey: text("deepgram_api_key"),
  webhookUrl: text("webhook_url"),
  webhookSecret: text("webhook_secret"),
  webhookEnabled: boolean("webhook_enabled").notNull().default(false),
  webhookEvents: jsonb("webhook_events").$type<WebhookEventsConfig>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Metering for Gemini (and future LLM) calls — cost observability. */
export const llmUsage = pgTable(
  "llm_usage",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    meetingId: uuid("meeting_id").references(() => meetings.id, {
      onDelete: "set null",
    }),
    feature: text("feature").notNull(), // insights | chat | summary
    model: text("model"),
    estInputTokens: integer("est_input_tokens").notNull().default(0),
    estOutputTokens: integer("est_output_tokens").notNull().default(0),
    actorIdentity: text("actor_identity"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("llm_usage_meeting_idx").on(t.meetingId),
    index("llm_usage_feature_idx").on(t.feature),
    index("llm_usage_created_idx").on(t.createdAt),
  ],
);
