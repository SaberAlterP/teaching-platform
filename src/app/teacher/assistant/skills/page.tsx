import { requireTeacher } from "@/lib/auth";
import { listSkills } from "@/lib/ai/skills";
import { AssistantTabs } from "../AssistantTabs";
import { SkillsClient } from "./SkillsClient";

export default async function SkillsPage() {
  const t = await requireTeacher();
  const skills = await listSkills(t.id);
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <AssistantTabs />
      <p className="text-sm text-slate-500">
        技能是写给 AI 的规范说明。AI 平时只知道每个技能的名称和一句话说明，要做相关的事时才会读取全文并照着做。
        你可以修改内置技能（随时能恢复默认），也可以新建自己的技能，例如“本校课件格式要求”“某门课的术语表”。
      </p>
      <SkillsClient skills={skills} />
    </div>
  );
}
