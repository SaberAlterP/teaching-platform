"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveSettings, testSettings } from "../actions";

type Init = { hasKey: boolean; keyHint: string; keyBroken: boolean; model: string; baseUrl: string; thinking: boolean };

export function SettingsForm({ initial, models }: { initial: Init; models: string[] }) {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [model, setModel] = useState(initial.model);
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl);
  const [thinking, setThinking] = useState(initial.thinking);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const save = (extra: { apiKey?: string } = {}) =>
    start(async () => {
      setMsg(null);
      const r = await saveSettings({ model, baseUrl, thinking, ...(key.trim() ? { apiKey: key.trim() } : {}), ...extra });
      if (r.error) return setMsg({ ok: false, text: r.error });
      setKey("");
      setMsg({ ok: true, text: "已保存" });
      router.refresh();
    });
  const test = () =>
    start(async () => {
      setMsg(null);
      const r = await testSettings();
      setMsg("reply" in r ? { ok: true, text: `连接成功（${r.model}）：${r.reply}` } : { ok: false, text: r.error ?? "连接失败" });
    });

  return (
    <div className="card space-y-5 p-5">
      <div>
        <label className="label">DeepSeek 密钥</label>
        {initial.hasKey && (
          <p className="mb-1 text-sm text-slate-500">
            已保存：<code>{initial.keyHint}</code>
            {initial.keyBroken && <span className="ml-2 text-red-600">（无法解密，可能服务器密钥变了，请重新填写）</span>}
          </p>
        )}
        <input
          className="input font-mono"
          type="password"
          autoComplete="off"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={initial.hasKey ? "要更换时填写新密钥，不改就留空" : "sk-…"}
        />
        <p className="mt-1 text-xs text-slate-400">
          在 platform.deepseek.com 的“API keys”里创建。密钥加密保存在服务器上，页面不会再显示完整内容。网站目前是 http，填写时这一次是明文传输。
        </p>
      </div>

      <div>
        <label className="label">模型</label>
        <input className="input font-mono" list="ai-models" value={model} onChange={(e) => setModel(e.target.value)} />
        <datalist id="ai-models">{models.map((m) => <option key={m} value={m} />)}</datalist>
        <p className="mt-1 text-xs text-slate-400">deepseek-flash 是 DeepSeek V4.1 Flash（快、便宜）；deepseek-v4-pro 更强但更贵。DeepSeek 以后出新模型时，把名字填在这里即可。</p>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={thinking} onChange={(e) => setThinking(e.target.checked)} />
        <span>
          思考模式（推荐）
          <span className="block text-xs text-slate-400">先思考再动手，做动画和建课质量更好；关掉更快、更省。</span>
        </span>
      </label>

      <details className="text-sm">
        <summary className="cursor-pointer text-slate-500">高级：接口地址</summary>
        <input className="input mt-2 font-mono" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
        <p className="mt-1 text-xs text-slate-400">默认 https://api.deepseek.com。也可以填其他兼容 OpenAI 格式的服务地址。</p>
      </details>

      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={pending} onClick={() => save()}>保存</button>
        <button className="btn-outline" disabled={pending || (!initial.hasKey && !key)} onClick={test}>测试连接</button>
        {initial.hasKey && (
          <button className="btn-danger ml-auto" disabled={pending} onClick={() => confirm("删除已保存的 DeepSeek 密钥？") && save({ apiKey: "" })}>
            删除密钥
          </button>
        )}
      </div>
    </div>
  );
}
