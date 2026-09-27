export function StatusBadge({ status, openAt }: { status: string; openAt: string | null }) {
  if (status === "OPEN") return <span className="badge bg-emerald-50 text-emerald-700">已开放</span>;
  if (status === "SCHEDULED") {
    const d = openAt ? new Date(openAt) : null;
    const passed = d && d <= new Date();
    return (
      <span className={`badge ${passed ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
        {passed ? "已开放（定时）" : `定时 ${d ? fmt(d) : ""}`}
      </span>
    );
  }
  return <span className="badge bg-slate-100 text-slate-500">草稿</span>;
}

export function fmt(d: Date) {
  return d.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}
