"use client";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const GRID = "#e8ecf2";
const AXIS = { fontSize: 12, fill: "#64748b" };

export type Series = { key: string; label: string; color: string; stack?: string };

// 报告里通用的柱状图：data 每行一组柱子，series 指定画哪些字段
export function BarCard({
  title,
  data,
  xKey,
  series,
  unit = "",
  percent,
  height = 240,
}: {
  title: string;
  data: Record<string, string | number | null>[];
  xKey: string;
  series: Series[];
  unit?: string; // 提示框里数值后面的单位，如“人”“次”
  percent?: boolean; // 纵轴 0~100%
  height?: number;
}) {
  const empty = !data.length || data.every((d) => series.every((s) => !d[s.key]));
  return (
    <div className="card p-4 break-inside-avoid">
      <h3 className="mb-3 font-semibold">{title}</h3>
      {empty ? (
        <div className="flex items-center justify-center text-sm text-slate-400" style={{ height }}>暂无数据</div>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey={xKey} tick={AXIS} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis
              tick={AXIS}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              {...(percent ? { domain: [0, 100], unit: "%" } : {})}
            />
            <Tooltip
              cursor={{ fill: "#f1f5f9" }}
              formatter={(v, name) => [`${v}${percent ? "%" : unit ? ` ${unit}` : ""}`, name]}
              labelFormatter={(label, p) => (p?.[0]?.payload?.title as string) ?? label}
            />
            {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
            {series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                fill={s.color}
                stackId={s.stack}
                maxBarSize={44}
                radius={s.stack && i < series.length - 1 ? 0 : [4, 4, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export function PrintButton() {
  return (
    <button type="button" className="btn-outline print:hidden" onClick={() => window.print()}>
      打印 / 存为 PDF
    </button>
  );
}
