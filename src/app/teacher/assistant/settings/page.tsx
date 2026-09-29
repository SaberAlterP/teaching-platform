import { requireTeacher } from "@/lib/auth";
import { getAiSettings, MODEL_SUGGESTIONS } from "@/lib/ai/settings";
import { AssistantTabs } from "../AssistantTabs";
import { SettingsForm } from "./SettingsForm";

export default async function AssistantSettingsPage() {
  const t = await requireTeacher();
  const s = await getAiSettings(t.id);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <AssistantTabs />
      <SettingsForm
        initial={{ hasKey: s.hasKey, keyHint: s.apiKeyHint, keyBroken: s.hasKey && !s.apiKey, model: s.model, baseUrl: s.baseUrl, thinking: s.thinking }}
        models={MODEL_SUGGESTIONS}
      />
    </div>
  );
}
