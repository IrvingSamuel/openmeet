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

export type UserRole = "admin" | "user";
export type UserCreatedVia = "local" | "oidc" | "setup";
export type DeploymentMode = "server" | "platform";

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email"),
    name: text("name"),
    avatarUrl: text("avatar_url"),
    passwordHash: text("password_hash"),
    role: text("role").notNull().default("user"), // admin | user
    externalId: text("external_id"),
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    createdVia: text("created_via").notNull().default("local"), // local | oidc | setup
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("users_email_uidx").on(t.email),
    uniqueIndex("users_external_id_uidx").on(t.externalId),
  ],
);

export const oauthAccounts = pgTable(
  "oauth_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("oidc"),
    subject: text("subject").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("oauth_accounts_provider_subject_uidx").on(t.provider, t.subject),
    index("oauth_accounts_user_idx").on(t.userId),
  ],
);

/** Rooms are brand templates only — not meeting containers. */
export type RoomKind = "persistent" | "instant";

export const rooms = pgTable(
  "rooms",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    ownerIdentityId: uuid("owner_identity_id")
      .notNull()
      .references(() => users.id),
    boardId: text("board_id"),
    accessPolicy: text("access_policy").notNull().default("members"),
    kind: text("kind").notNull().default("persistent"),
    livekitRoomName: text("livekit_room_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("rooms_slug_uidx").on(t.slug),
    index("rooms_board_idx").on(t.boardId),
    index("rooms_owner_idx").on(t.ownerIdentityId),
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
  themePreset: text("theme_preset").default("sky"),
  primaryColor: text("primary_color").default("#0ea5e9"),
  secondaryColor: text("secondary_color").default("#38bdf8"),
  tertiaryColor: text("tertiary_color").default("#818cf8"),
  fontFamily: text("font_family").default("Inter, system-ui, sans-serif"),
  background: text("background").default("#0b1020"),
  lobbyTitle: text("lobby_title"),
  lobbySubtitle: text("lobby_subtitle"),
  faviconUrl: text("favicon_url"),
  customCss: text("custom_css"),
  primaryPaint: jsonb("primary_paint"),
  secondaryPaint: jsonb("secondary_paint"),
  tertiaryPaint: jsonb("tertiary_paint"),
  backgroundPaint: jsonb("background_paint"),
  patternUrl: text("pattern_url"),
  patternSizeMode: text("pattern_size_mode").default("percent"),
  patternSize: integer("pattern_size").default(24),
  patternTint: text("pattern_tint").default("none"),
  patternTintColor: text("pattern_tint_color"),
  patternTintOpacity: integer("pattern_tint_opacity").default(55),
  bgAnimation: text("bg_animation").default("none"),
  bgAnimationSpeed: integer("bg_animation_speed").default(3),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Per-user default UI brand applied to instant meetings when no room template / ui is sent. */
export const identityBrands = pgTable("identity_brands", {
  id: uuid("id").defaultRandom().primaryKey(),
  identityId: uuid("identity_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  logoUrl: text("logo_url"),
  wordmark: text("wordmark"),
  themePreset: text("theme_preset").default("sky"),
  primaryColor: text("primary_color").default("#0ea5e9"),
  secondaryColor: text("secondary_color").default("#38bdf8"),
  tertiaryColor: text("tertiary_color").default("#818cf8"),
  fontFamily: text("font_family").default("Inter, system-ui, sans-serif"),
  background: text("background").default("#0b1020"),
  lobbyTitle: text("lobby_title"),
  lobbySubtitle: text("lobby_subtitle"),
  faviconUrl: text("favicon_url"),
  customCss: text("custom_css"),
  primaryPaint: jsonb("primary_paint"),
  secondaryPaint: jsonb("secondary_paint"),
  tertiaryPaint: jsonb("tertiary_paint"),
  backgroundPaint: jsonb("background_paint"),
  patternUrl: text("pattern_url"),
  patternSizeMode: text("pattern_size_mode").default("percent"),
  patternSize: integer("pattern_size").default(24),
  patternTint: text("pattern_tint").default("none"),
  patternTintColor: text("pattern_tint_color"),
  patternTintOpacity: integer("pattern_tint_opacity").default(55),
  bgAnimation: text("bg_animation").default("none"),
  bgAnimationSpeed: integer("bg_animation_speed").default(3),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const meetings = pgTable(
  "meetings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Optional brand-template reference; deleting the room does not delete the meeting. */
    roomId: uuid("room_id").references(() => rooms.id, { onDelete: "set null" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    ownerIdentityId: uuid("owner_identity_id")
      .notNull()
      .references(() => users.id),
    boardId: text("board_id"),
    accessPolicy: text("access_policy").notNull().default("public"),
    livekitRoomName: text("livekit_room_name").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    livekitRoomSid: text("livekit_room_sid"),
    /**
     * Per-meeting LiveKit/app empty timeout (seconds). Null = use env
     * LIVEKIT_EMPTY_TIMEOUT_SEC / MEETING_EMPTY_TIMEOUT_SEC.
     */
    emptyTimeoutSec: integer("empty_timeout_sec"),
    /** scheduled = created, awaiting first join; active = in call; ended = closed */
    status: text("status").notNull().default("scheduled"),
    summaryStatus: text("summary_status").notNull().default("pending"),
    insightsCache: jsonb("insights_cache"),
    insightsCacheSegmentCount: integer("insights_cache_segment_count"),
    insightsCacheAt: timestamp("insights_cache_at", { withTimezone: true }),
    insightsRegenCount: integer("insights_regen_count").notNull().default(0),
    insightsStatus: text("insights_status").notNull().default("idle"),
  },
  (t) => [
    uniqueIndex("meetings_slug_uidx").on(t.slug),
    index("meetings_room_idx").on(t.roomId),
    index("meetings_owner_idx").on(t.ownerIdentityId),
    index("meetings_livekit_idx").on(t.livekitRoomName),
    index("meetings_status_idx").on(t.status),
  ],
);

/** Brand snapshot frozen at meeting creation (survives room deletion). */
export const meetingBrands = pgTable("meeting_brands", {
  id: uuid("id").defaultRandom().primaryKey(),
  meetingId: uuid("meeting_id")
    .notNull()
    .references(() => meetings.id, { onDelete: "cascade" })
    .unique(),
  logoUrl: text("logo_url"),
  wordmark: text("wordmark"),
  themePreset: text("theme_preset").default("sky"),
  primaryColor: text("primary_color").default("#0ea5e9"),
  secondaryColor: text("secondary_color").default("#38bdf8"),
  tertiaryColor: text("tertiary_color").default("#818cf8"),
  fontFamily: text("font_family").default("Inter, system-ui, sans-serif"),
  background: text("background").default("#0b1020"),
  lobbyTitle: text("lobby_title"),
  lobbySubtitle: text("lobby_subtitle"),
  faviconUrl: text("favicon_url"),
  customCss: text("custom_css"),
  primaryPaint: jsonb("primary_paint"),
  secondaryPaint: jsonb("secondary_paint"),
  tertiaryPaint: jsonb("tertiary_paint"),
  backgroundPaint: jsonb("background_paint"),
  patternUrl: text("pattern_url"),
  patternSizeMode: text("pattern_size_mode").default("percent"),
  patternSize: integer("pattern_size").default(24),
  patternTint: text("pattern_tint").default("none"),
  patternTintColor: text("pattern_tint_color"),
  patternTintOpacity: integer("pattern_tint_opacity").default(55),
  bgAnimation: text("bg_animation").default("none"),
  bgAnimationSpeed: integer("bg_animation_speed").default(3),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const participants = pgTable(
  "participants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    identityId: uuid("identity_id").references(() => users.id),
    displayName: text("display_name").notNull(),
    role: text("role").notNull().default("participant"),
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
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    roomId: uuid("room_id").references(() => rooms.id, { onDelete: "set null" }),
    displayName: text("display_name").notNull(),
    identityId: uuid("identity_id").references(() => users.id),
    clientInstanceId: text("client_instance_id").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [
    index("join_requests_meeting_idx").on(t.meetingId),
    index("join_requests_meeting_status_idx").on(t.meetingId, t.status),
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
  externalTaskId: text("external_task_id"),
  externalBoardId: text("external_board_id"),
  status: text("status").notNull().default("pending"),
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
    role: text("role").notNull(),
    body: text("body").notNull(),
    authorName: text("author_name"),
    authorIdentity: text("author_identity"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("copilot_chat_messages_meeting_idx").on(t.meetingId)],
);

export type RecordingEngine = "egress" | "browser";
export type RecordingStorageBackend = "local" | "s3";
export type RecordingControlMode = "manual" | "auto";
export type RecordingStatus =
  | "pending"
  | "recording"
  | "uploading"
  | "ready"
  | "failed";

export const recordings = pgTable(
  "recordings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    storageUrl: text("storage_url"),
    status: text("status").notNull().default("pending"),
    engine: text("engine").notNull().default("browser"),
    storageBackend: text("storage_backend").notNull().default("local"),
    egressId: text("egress_id"),
    filepath: text("filepath"),
    objectKey: text("object_key"),
    mimeType: text("mime_type"),
    bytes: integer("bytes"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("recordings_meeting_idx").on(t.meetingId),
    index("recordings_egress_idx").on(t.egressId),
  ],
);

export const APP_SETTINGS_ROW_ID = "00000000-0000-0000-0000-000000000001";

export type WebhookEventsConfig = {
  transcript: boolean;
  chat: boolean;
  summary: boolean;
  tasks: boolean;
  recording: boolean;
};

export const DEFAULT_WEBHOOK_EVENTS: WebhookEventsConfig = {
  transcript: true,
  chat: true,
  summary: true,
  tasks: true,
  recording: true,
};

export const appSettings = pgTable("app_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  locale: text("locale").notNull().default("pt-BR"),
  deploymentMode: text("deployment_mode").notNull().default("platform"),
  allowSignup: boolean("allow_signup").notNull().default(true),
  geminiApiKey: text("gemini_api_key"),
  geminiModel: text("gemini_model"),
  geminiSummaryModel: text("gemini_summary_model"),
  aiFallbackEnabled: boolean("ai_fallback_enabled"),
  aiFallbackBaseUrl: text("ai_fallback_base_url"),
  aiFallbackApiKey: text("ai_fallback_api_key"),
  aiFallbackModel: text("ai_fallback_model"),
  aiFallbackSummaryModel: text("ai_fallback_summary_model"),
  deepgramApiKey: text("deepgram_api_key"),
  webhookUrl: text("webhook_url"),
  webhookSecret: text("webhook_secret"),
  webhookEnabled: boolean("webhook_enabled").notNull().default(false),
  webhookEvents: jsonb("webhook_events").$type<WebhookEventsConfig>(),
  recordingEnabled: boolean("recording_enabled").notNull().default(false),
  recordingEngine: text("recording_engine").notNull().default("browser"),
  recordingControlMode: text("recording_control_mode")
    .notNull()
    .default("manual"),
  recordingStorage: text("recording_storage").notNull().default("local"),
  recordingS3Endpoint: text("recording_s3_endpoint"),
  recordingS3Bucket: text("recording_s3_bucket"),
  recordingS3Region: text("recording_s3_region"),
  recordingS3AccessKey: text("recording_s3_access_key"),
  recordingS3SecretKey: text("recording_s3_secret_key"),
  uiPrimary: text("ui_primary").default("#0ea5e9"),
  uiSecondary: text("ui_secondary").default("#38bdf8"),
  uiTertiary: text("ui_tertiary").default("#818cf8"),
  uiBackground: text("ui_background").default("#0b1020"),
  uiInk: text("ui_ink").default("#f8fafc"),
  uiWordmark: text("ui_wordmark").default("OpenMeet"),
  uiLogoUrl: text("ui_logo_url"),
  uiFaviconUrl: text("ui_favicon_url"),
  uiFontFamily: text("ui_font_family").default("Inter, system-ui, sans-serif"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const llmUsage = pgTable(
  "llm_usage",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    meetingId: uuid("meeting_id").references(() => meetings.id, {
      onDelete: "set null",
    }),
    feature: text("feature").notNull(),
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
