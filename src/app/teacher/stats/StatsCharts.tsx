"use client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const BAR = "#2f6fed";
const GRID = "#e8ecf2";
const AXIS = { fontSize: 12, fill: "#64748b" };

export function StatsCharts({
  lessonCompletion,
  lessonScore,
  buckets,
}: {
  lessonCompletion: { name: string; title: string; rate: number }[];
  lessonScore: { name: string; title: string; rate: number }[];
  buckets: { name: string; count: number }[];
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <div className="card p-4">
        <h2 className="mb-3 font-semibold">各课时完成率</h2>
        {lessonCompletion.length ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={lessonCompletion} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="name" tick={AXIS} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} unit="%" tick={AXIS} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: "#f1f5f9" }}
                formatter={(v) => [`${v}%`, "完成率"]}
                labelFormatter={(_, p) => p?.[0]?.payload?.title ?? ""}
              />
              <Bar dataKey="rate" fill={BAR} radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <Empty />
        )}
      </div>
      <div className="card p-4">
        <h2 className="mb-3 font-semibold">各课时平均得分率</h2>
        {lessonScore.length ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={lessonScore} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="name" tick={AXIS} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} unit="%" tick={AXIS} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: "#f1f5f9" }}
                formatter={(v) => [`${v}%`, "得分率"]}
                labelFormatter={(_, p) => p?.[0]?.payload?.title ?? ""}
              />
              <Bar dataKey="rate" fill="#16a394" radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <Empty />
        )}
      </div>
      <div className="card p-4">
        <h2 className="mb-3 font-semibold">总得分率分布（人数）</h2>
        {buckets.some((b) => b.count) ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={buckets} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="name" tick={AXIS} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: "#f1f5f9" }} formatter={(v) => [`${v} 人`, "人数"]} />
              <Bar dataKey="count" fill={BAR} radius={[4, 4, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <Empty />
        )}
      </div>
    </div>
  );
}

function Empty() {
  return <div className="flex h-[220px] items-center justify-center text-sm text-slate-400">暂无数据</div>;
}
