"use client";
import { useRef, useState, useTransition } from "react";
import { generateApiKey, revokeApiKey } from "../actions";

type Key = { id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null };

const fmt = (s: string | null) => (s ? new Date(s).toLocaleString("zh-CN", { hour12: false }) : "从未使用");

export function ApiKeysClient({ keys }: { keys: Key[] }) {
  const [name, setName] = useState("Claude");
  const [created, setCreated] = useState("");
  const [copied, setCopied] = useState<"" | "ok" | "fail">("");
  const [pending, start] = useTransition();
  const boxRef = useRef<HTMLTextAreaElement>(null);

  // 网站目前是 http，浏览器不允许用 navigator.clipboard，所以退回到选中文本框 + execCommand
  async function copy() {
    const box = boxRef.current;
    box?.focus();
    box?.select();
    let ok = false;
    try {
      if (window.isSecureContext && navigator.clipboard) {
        await navigator.clipboard.writeText(message);
        ok = true;
      }
    } catch {}
    if (!ok) {
      try {
        ok = document.execCommand("copy");
      } catch {}
    }
    setCopied(ok ? "ok" : "fail");
  }

  // 给 AI 的完整说明：地址 + 密钥，复制后直接发给它
  const message = created
    ? `平台地址：${typeof window === "undefined" ? "" : window.location.origin}\nAI 接口密钥：${created}\n（接口说明：GET /api/ai）`
    : "";

  return (
    <div className="space-y-6">
      <div className="card space-y-3 p-5">
        <h2 className="font-semibold">生成新密钥</h2>
        <div className="flex flex-wrap gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} className="input max-w-xs" placeholder="备注，例如 Claude" />
          <button
            className="btn-primary"
            disabled={pending}
            onClick={() => start(async () => { setCopied(""); setCreated(await generateApiKey(name)); })}
          >
            {pending ? "生成中…" : "生成密钥"}
          </button>
        </div>
        {created && (
          <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-800">密钥只显示这一次，请复制下面整段发给 AI：</p>
            <textarea
              ref={boxRef}
              readOnly
              value={message}
              rows={3}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full resize-none rounded bg-white p-3 font-mono text-sm break-all"
            />
            <div className="flex items-center gap-3">
              <button className="btn-outline" onClick={copy}>
                {copied === "ok" ? "已复制" : "复制"}
              </button>
              {copied === "fail" && (
                <span className="text-sm text-amber-800">浏览器不允许自动复制，文字已选中，请按 Ctrl+C（手机长按）复制。</span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="card p-5">
        <h2 className="mb-3 font-semibold">已有密钥</h2>
        {keys.length === 0 ? (
          <p className="text-sm text-slate-500">还没有密钥。</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {keys.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {k.name} <span className="ml-1 font-mono text-xs text-slate-400">{k.prefix}…</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    创建于 {fmt(k.createdAt)} · 最近使用 {fmt(k.lastUsedAt)}
                  </div>
                </div>
                <button
                  className="btn-danger"
                  disabled={pending}
                  onClick={() => {
                    if (confirm(`撤销密钥“${k.name}”？撤销后立即失效。`)) start(() => revokeApiKey(k.id));
                  }}
                >
                  撤销
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
