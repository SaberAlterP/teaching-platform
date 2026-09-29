import Link from "next/link";

export type TileInfo = {
  id: string;
  title: string;
  summary: string;
  done: number;
  total: number;
  pct: number;
  hasHtml: boolean;
  hasQuiz: boolean;
  hasText: boolean;
  score: number | null; // 已提交的计分项得分合计，没提交过为 null
  maxScore: number;
};

// 标题以“5-3 ”开头时，把编号拆出来放在方块左上角
export function splitTitle(title: string) {
  const m = title.match(/^(\d+(?:[-.]\d+)+)\s+(.*)$/);
  return m ? { no: m[1], name: m[2] } : { no: "", name: title };
}

const chip = "rounded-md px-1.5 py-0.5 text-[11px] font-medium";

export function LessonTile({ t, fallbackNo }: { t: TileInfo; fallbackNo: string }) {
  const { no, name } = splitTitle(t.title);
  const state = t.pct === 100 ? "done" : t.pct > 0 ? "doing" : "todo";
  const tone = {
    done: "border-emerald-200 bg-emerald-50/60 hover:border-emerald-400",
    doing: "border-amber-300 bg-amber-50/50 hover:border-amber-400",
    todo: "border-slate-200 bg-white hover:border-brand-500",
  }[state];
  return (
    <Link
      href={`/learn/${t.id}`}
      title={t.summary || undefined}
      className={`group flex min-h-36 flex-col rounded-2xl border p-3.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-4 ${tone}`}
    >
      <div className="flex items-start gap-2">
        <span className="text-xl font-extrabold leading-none tracking-tight text-brand-600 sm:text-2xl">{no || fallbackNo}</span>
        <span
          className={`ml-auto flex h-6 shrink-0 items-center justify-center rounded-full px-2 text-xs font-medium ${
            state === "done"
              ? "bg-emerald-500 text-white"
              : state === "doing"
                ? "bg-amber-100 text-amber-700"
                : "bg-slate-100 text-slate-400"
          }`}
        >
          {state === "done" ? "✓ 完成" : state === "doing" ? `${t.pct}%` : "未开始"}
        </span>
      </div>
      <div className="mt-2 line-clamp-3 text-[15px] leading-snug font-semibold text-slate-800 group-hover:text-brand-600">{name}</div>
      <div className="mt-auto flex flex-wrap items-center gap-1 pt-3">
        {t.hasHtml && <span className={`${chip} bg-violet-100 text-violet-700`}>互动</span>}
        {t.hasQuiz && <span className={`${chip} bg-sky-100 text-sky-700`}>小测</span>}
        {t.hasText && <span className={`${chip} bg-slate-100 text-slate-500`}>图文</span>}
        {t.score !== null && (
          <span className="ml-auto text-xs font-semibold text-slate-600">
            {Number.isInteger(t.score) ? t.score : t.score.toFixed(1)}<span className="font-normal text-slate-400">/{t.maxScore}</span> 分
          </span>
        )}
      </div>
      {state !== "todo" && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-black/5">
          <div className={`h-full rounded-full ${state === "done" ? "bg-emerald-500" : "bg-amber-400"}`} style={{ width: `${t.pct}%` }} />
        </div>
      )}
    </Link>
  );
}
