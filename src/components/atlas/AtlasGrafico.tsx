import { Bar, CartesianGrid, Cell, ComposedChart, LabelList, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export const atlasCores = {
  accent: "var(--atlas-accent)", blue: "var(--atlas-blue)", success: "var(--atlas-success)",
  warning: "var(--atlas-warning)", danger: "var(--atlas-danger)", support: "var(--atlas-support)",
  purple: "var(--atlas-purple)", cyan: "var(--atlas-cyan)", muted: "var(--muted-foreground)",
};
const numero = (v: unknown) => Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const moeda = (v: unknown) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
type Serie = { key: string; name: string; color: string; line?: boolean; right?: boolean; stack?: string; percent?: boolean; money?: boolean; labels?: boolean; opacity?: number };
type Props = { data: Record<string, unknown>[]; category: string; series: Serie[]; horizontal?: boolean; percent?: boolean; rightPercent?: boolean; money?: boolean; height?: number; legend?: boolean };

/** Atlas chart grammar, fed exclusively by each page's existing calculated data. */
export function AtlasGrafico({ data, category, series, horizontal = false, percent = false, rightPercent = false, money = false, height = 260, legend = true }: Props) {
  const axisFormat = (v: number) => percent ? `${numero(v)}%` : money ? `${numero(v / 1000)} mil` : numero(v);
  const right = series.some((s) => s.right);
  return <div className="atlas-grafico w-full min-w-0" style={{ height }}>
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 24, right: horizontal ? 70 : 24, bottom: 8, left: 8 }} barGap={3}>
        <CartesianGrid stroke="var(--border)" horizontal={!horizontal} vertical={horizontal} />
        <XAxis dataKey={horizontal ? undefined : category} type={horizontal ? "number" : "category"} domain={percent && horizontal ? [0, 100] : undefined} tickFormatter={horizontal ? axisFormat : undefined} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={20} />
        <YAxis yAxisId="left" dataKey={horizontal ? category : undefined} type={horizontal ? "category" : "number"} domain={percent && !horizontal ? [0, 100] : undefined} width={horizontal ? 150 : 62} tickFormatter={horizontal ? undefined : axisFormat} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} interval={horizontal ? 0 : undefined} />
        {right && <YAxis yAxisId="right" orientation="right" domain={rightPercent ? [0, 100] : undefined} tickFormatter={(v) => rightPercent ? `${numero(v)}%` : numero(v)} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />}
        <Tooltip contentStyle={{ background: "var(--popover)", color: "var(--popover-foreground)", borderColor: "var(--border)", borderRadius: 8 }} formatter={(v, name) => { const s = series.find((s) => s.name === name); return [s?.money ? moeda(v) : `${numero(v)}${s?.percent ? "%" : ""}`, name]; }} />
        {legend && <Legend verticalAlign="bottom" iconType="rect" iconSize={12} wrapperStyle={{ fontSize: 11, paddingTop: 12, color: "var(--muted-foreground)" }} />}
        {series.map((s) => s.line ? <Line key={s.key} type="monotone" yAxisId={s.right ? "right" : "left"} dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={3} dot={{ r: 3, fill: s.color }} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={false} /> : <Bar key={s.key} yAxisId={s.right ? "right" : "left"} dataKey={s.key} name={s.name} fill={s.color} fillOpacity={s.opacity ?? 1} stackId={s.stack} radius={s.stack ? 2 : 4} maxBarSize={36} isAnimationActive={false}>
          {s.labels !== false && <LabelList dataKey={s.key} position={horizontal ? "right" : "top"} fill="var(--foreground)" fontSize={10} formatter={(v: unknown) => s.money ? moeda(v) : `${numero(v)}${s.percent ? "%" : ""}`} />}
        </Bar>)}
      </ComposedChart>
    </ResponsiveContainer>
  </div>;
}

export function AtlasCausas({ data }: { data: { hipotese: string; n: number }[] }) {
  const colors = [atlasCores.accent, atlasCores.blue, atlasCores.warning, atlasCores.danger, atlasCores.success, atlasCores.support, atlasCores.muted, atlasCores.purple];
  return <div className="atlas-grafico h-80 min-w-0"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data} dataKey="n" nameKey="hipotese" innerRadius="45%" outerRadius="68%" stroke="none" isAnimationActive={false}>{data.map((d, i) => <Cell key={d.hipotese} fill={colors[i % colors.length]} />)}</Pie><Tooltip contentStyle={{ background: "var(--popover)", color: "var(--popover-foreground)", borderColor: "var(--border)" }} /><Legend iconType="rect" iconSize={10} wrapperStyle={{ fontSize: 11 }} /></PieChart></ResponsiveContainer></div>;
}