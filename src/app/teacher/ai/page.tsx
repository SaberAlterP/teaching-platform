import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireTeacher } from "@/lib/auth";
import { ApiKeysClient } from "./ApiKeysClient";

export default async function AiPage() {
  const t = await requireTeacher();
  const keys = await db
    .select({
      id: schema.apiKeys.id,
      name: schema.apiKeys.name,
      prefix: schema.apiKeys.prefix,
      createdAt: schema.apiKeys.createdAt,
      lastUsedAt: schema.apiKeys.lastUsedAt,
    })
    .from(schema.apiKeys)
    .where(eq(schema.apiKeys.teacherId, t.id))
    .orderBy(desc(schema.apiKeys.createdAt));
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">AI 接口</h1>
        <p className="mt-1 text-sm text-slate-500">
          生成一个密钥交给 Claude 等 AI 助手，它就能直接查看和修改本课程的内容：新建和修改课时、增删改模块、上传互动包、设置开放状态。它不能删除课时，也看不到学生账号和成绩。用完后建议撤销，下次再生成新的。
        </p>
      </div>
      <ApiKeysClient
        keys={keys.map((k) => ({ ...k, createdAt: k.createdAt.toISOString(), lastUsedAt: k.lastUsedAt?.toISOString() ?? null }))}
      />
    </div>
  );
}
