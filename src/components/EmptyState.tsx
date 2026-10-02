// 空状态：一张简单的纸箱插画 + 文案，跟随主题色
export function EmptyState({ title, hint, children }: { title: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center">
      <svg width="132" height="104" viewBox="0 0 132 104" fill="none" aria-hidden className="mb-4">
        <ellipse cx="66" cy="92" rx="46" ry="7" fill="currentColor" className="text-slate-200" />
        <path d="M30 40 66 24l36 16v38L66 94 30 78Z" className="fill-brand-50 stroke-brand-500" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M30 40 66 56l36-16M66 56v38" className="stroke-brand-500" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M48 32 84 48v10" className="stroke-brand-500" strokeWidth="2" strokeDasharray="3 4" />
        <g className="origin-center animate-[tp-float_3s_ease-in-out_infinite]">
          <circle cx="102" cy="22" r="3" className="fill-brand-500" opacity=".5" />
          <circle cx="28" cy="20" r="2.2" className="fill-brand-500" opacity=".4" />
          <path d="M112 38l2 4 4 2-4 2-2 4-2-4-4-2 4-2Z" className="fill-brand-500" opacity=".55" />
        </g>
      </svg>
      <div className="font-semibold text-slate-600">{title}</div>
      {hint && <p className="mt-1 text-sm text-slate-400">{hint}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
