CREATE TABLE "ai_changes" (
	"id" text PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL,
	"tool_call_id" text NOT NULL,
	"kind" text NOT NULL,
	"target_id" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"undone" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_chats" (
	"id" text PRIMARY KEY NOT NULL,
	"teacher_id" text NOT NULL,
	"title" text DEFAULT '新对话' NOT NULL,
	"course_id" text,
	"lesson_id" text,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'idle' NOT NULL,
	"error" text DEFAULT '' NOT NULL,
	"pending" jsonb,
	"decisions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"usage" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_settings" (
	"teacher_id" text PRIMARY KEY NOT NULL,
	"api_key_enc" text DEFAULT '' NOT NULL,
	"api_key_hint" text DEFAULT '' NOT NULL,
	"model" text DEFAULT 'deepseek-flash' NOT NULL,
	"base_url" text DEFAULT 'https://api.deepseek.com' NOT NULL,
	"thinking" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_skills" (
	"id" text PRIMARY KEY NOT NULL,
	"teacher_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_changes" ADD CONSTRAINT "ai_changes_chat_id_ai_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."ai_chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_chats" ADD CONSTRAINT "ai_chats_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_skills" ADD CONSTRAINT "ai_skills_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_changes_chat_idx" ON "ai_changes" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "ai_chats_teacher_idx" ON "ai_chats" USING btree ("teacher_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_skills_teacher_slug" ON "ai_skills" USING btree ("teacher_id","slug");