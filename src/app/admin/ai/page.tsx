import { getAiSettings, MODEL_SUGGESTIONS } from "@/lib/ai/settings";
import { SettingsForm } from "./SettingsForm";

export default async function AdminAiPage() {
  const s = await getAiSettings();
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-bold">AI 设置</h1>
        <p className="mt-1 text-sm text-slate-500">全站所有老师共用这里的 DeepSeek 密钥和模型，老师自己不能修改。费用都记在这个密钥上，各老师的用量见“用量统计”。</p>
      </div>
      <SettingsForm
        initial={{ hasKey: s.hasKey, keyHint: s.apiKeyHint, keyBroken: s.hasKey && !s.apiKey, model: s.model, baseUrl: s.baseUrl, thinking: s.thinking }}
        models={MODEL_SUGGESTIONS}
      />
    </div>
  );
}
