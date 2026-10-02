// 圆环进度（纯 SVG）。颜色跟随主题：底环用浅灰，进度用 currentColor
export function ProgressRing({ pct, size = 96, stroke = 9, label, className = "" }: { pct: number; size?: number; stroke?: number; label?: string; className?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className={`relative shrink-0 ${className}`} style={{ width: size, height: size }} role="img" aria-label={`进度 ${pct}%`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity={0.15} strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, Math.max(0, pct)) / 100)}
          style={{ transition: "stroke-dashoffset .8s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-tight">
        <span className="font-bold text-slate-800" style={{ fontSize: size * 0.24 }}>{pct}%</span>
        {label && <span className="text-slate-500" style={{ fontSize: Math.max(10, size * 0.12) }}>{label}</span>}
      </div>
    </div>
  );
}
