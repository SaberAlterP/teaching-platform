import "server-only";
import { inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { StoredMessage } from "./agent";
import { toolLabel } from "./tools";
import { undoWarning } from "./undo";

// 把存储的消息转换成界面显示的条目。界面按 key 合并（工具结果到达后更新同一条）。
export type ViewItem =
  | { key: string; kind: "user"; text: string; files: string[] }
  | { key: string; kind: "assistant"; text: string; reasoning: string; truncated?: boolean }
  | {
      key: string;
      kind: "tool";
      label: string;
      state: "running" | "ok" | "error" | "rejected" | "aborted";
      error?: string;
      file?: string;
      change?: { id: string; undone: boolean; warn: string };
    };

export async function viewItems(messages: StoredMessage[], from: number): Promise<ViewItem[]> {
  const results = new Map<string, { m: StoredMessage & { role: "tool" }; i: number }>();
  const calls = new Map<string, { name: string; args: string }>();
  messages.forEach((m, i) => {
    if (m.role === "tool") results.set(m.tool_call_id, { m: m as StoredMessage & { role: "tool" }, i });
    if (m.role === "assistant") for (const c of m.tool_calls ?? []) calls.set(c.id, { name: c.function.name, args: c.function.arguments });
  });

  const toolItem = (id: string): ViewItem => {
    const c = calls.get(id);
    const r = results.get(id)?.m;
    let error: string | undefined;
    if (r && r.meta?.ok === false) {
      try {
        error = JSON.parse(r.content).error;
      } catch {}
    }
    return {
      key: "t" + id,
      kind: "tool",
      label: r?.meta?.label ?? toolLabel(c?.name ?? "", c?.args ?? ""),
      state: !r ? "running" : r.meta?.status ?? (r.meta?.ok === false ? "error" : "ok"),
      error,
      file: r?.meta?.file,
      change: r?.meta?.changeId ? { id: r.meta.changeId, undone: false, warn: "" } : undefined,
    };
  };

  const items: ViewItem[] = [];
  const seen = new Set<string>();
  for (let i = Math.max(0, from); i < messages.length; i++) {
    const m = messages[i];
    if (m.role === "user") items.push({ key: "m" + i, kind: "user", text: m.meta?.display ?? m.content, files: m.meta?.files ?? [] });
    else if (m.role === "assistant") {
      const truncated = !!m.meta?.truncated && !m.tool_calls?.length; // 工具参数被截断时，工具那一行已经说明
      if (m.content || truncated) items.push({ key: "m" + i, kind: "assistant", text: m.content ?? "", reasoning: m.reasoning_content ?? "", truncated });
      for (const c of m.tool_calls ?? []) {
        items.push(toolItem(c.id));
        seen.add(c.id);
      }
    } else if (m.role === "tool" && !seen.has(m.tool_call_id)) {
      items.push(toolItem(m.tool_call_id));
      seen.add(m.tool_call_id);
    }
  }

  // 撤销状态
  const ids = items.flatMap((x) => (x.kind === "tool" && x.change ? [x.change.id] : []));
  if (ids.length) {
    const rows = await db
      .select({ id: schema.aiChanges.id, undone: schema.aiChanges.undone, kind: schema.aiChanges.kind })
      .from(schema.aiChanges)
      .where(inArray(schema.aiChanges.id, ids));
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const x of items)
      if (x.kind === "tool" && x.change) {
        const r = byId.get(x.change.id);
        if (r) x.change = { id: r.id, undone: r.undone, warn: undoWarning(r.kind) };
        else x.change = undefined;
      }
  }
  return items;
}
