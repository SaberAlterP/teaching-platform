CREATE TABLE "ai_global_settings" (
	"id" text PRIMARY KEY DEFAULT 'global' NOT NULL,
	"api_key_enc" text DEFAULT '' NOT NULL,
	"api_key_hint" text DEFAULT '' NOT NULL,
	"model" text DEFAULT 'deepseek-flash' NOT NULL,
	"base_url" text DEFAULT 'https://api.deepseek.com' NOT NULL,
	"thinking" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage_log" (
	"id" text PRIMARY KEY NOT NULL,
	"teacher_id" text NOT NULL,
	"chat_id" text,
	"model" text DEFAULT '' NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"cached_tokens" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_usage_log" ADD CONSTRAINT "ai_usage_log_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_teacher_time_idx" ON "ai_usage_log" USING btree ("teacher_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_time_idx" ON "ai_usage_log" USING btree ("created_at");--> statement-breakpoint
-- 初始管理员：最早创建的教师账号
UPDATE "users" SET "is_admin" = true WHERE "id" = (SELECT "id" FROM "users" WHERE "role" = 'TEACHER' ORDER BY "created_at" LIMIT 1);--> statement-breakpoint
-- 已有的 DeepSeek 设置：把最近保存过密钥的那份变成全站设置
INSERT INTO "ai_global_settings" ("id", "api_key_enc", "api_key_hint", "model", "base_url", "thinking")
SELECT 'global', "api_key_enc", "api_key_hint", "model", "base_url", "thinking" FROM "ai_settings"
WHERE "api_key_enc" <> '' ORDER BY "updated_at" DESC LIMIT 1
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- 以前的用量只存在对话里：每个对话补一条汇总记录（时间取最后更新时间）
INSERT INTO "ai_usage_log" ("id", "teacher_id", "chat_id", "model", "prompt_tokens", "completion_tokens", "cached_tokens", "created_at")
SELECT md5(random()::text || "id"), "teacher_id", "id", '', COALESCE(("usage"->>'prompt')::int, 0), COALESCE(("usage"->>'completion')::int, 0), COALESCE(("usage"->>'cached')::int, 0), "updated_at"
FROM "ai_chats" WHERE COALESCE(("usage"->>'requests')::int, 0) > 0;
