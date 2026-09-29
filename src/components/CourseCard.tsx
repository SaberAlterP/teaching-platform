// 课程方块：教师首页和学生首页共用。外层由调用方包成链接或按钮。
const PALETTE = [
  "from-brand-500 to-indigo-500",
  "from-emerald-500 to-teal-500",
  "from-orange-400 to-rose-500",
  "from-violet-500 to-fuchsia-500",
  "from-sky-500 to-cyan-500",
  "from-amber-400 to-orange-500",
];

export function CourseCard({
  title, description, index, muted, children,
}: { title: string; description: string; index: number; muted?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex h-full flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition group-hover:-translate-y-0.5 group-hover:shadow-md ${muted ? "border-dashed border-slate-300" : "border-slate-200 group-hover:border-brand-500"}`}>
      <div className={`relative h-24 bg-linear-to-br ${muted ? "from-slate-300 to-slate-400" : PALETTE[index % PALETTE.length]} p-4 text-white`}>
        <span className="absolute -right-2 -bottom-6 text-8xl leading-none font-black text-white/15 select-none">{title.slice(0, 1)}</span>
        <div className="relative line-clamp-2 text-lg leading-snug font-bold">{title}</div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <p className="line-clamp-2 min-h-10 text-sm text-slate-500">{description || "暂无简介"}</p>
        <div className="mt-auto">{children}</div>
      </div>
    </div>
  );
}
