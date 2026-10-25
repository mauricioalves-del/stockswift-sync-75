import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { atlasCores } from "./AtlasGrafico";
import { tendenciaAcuracia } from "@/lib/atlas-tendencia";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function AtlasTendencia({ dias }: { dias: { data: string; acuracia: number | null }[] }) {
  const { pontos, inclinacao, projecao5 } = tendenciaAcuracia(dias);
  const direcao = inclinacao == null ? null : inclinacao > 0 ? "↑ Tendência de melhora" : inclinacao < 0 ? "↓ Tendência de queda" : "→ Tendência estável";
  return <Card className="min-w-0">
    <CardHeader className="pb-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base">Tendência de Acurácia com Projeção</CardTitle>
        {direcao && <span className={`text-xs ${inclinacao != null && inclinacao < 0 ? "text-destructive" : "text-muted-foreground"}`}>{direcao}</span>}
      </div>
    </CardHeader>
    <CardContent>
      <div className="atlas-grafico h-80 min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={pontos} margin={{ top: 24, right: 24, bottom: 8, left: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="rotulo" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={12} />
            <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} width={46} axisLine={false} tickLine={false} />
            <Tooltip labelFormatter={(_, payload) => String(payload[0]?.payload?.data ?? "").split("-").reverse().join("/")} formatter={(v, name) => [`${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`, name]} contentStyle={{ background: "var(--popover)", color: "var(--popover-foreground)", borderColor: "var(--border)", borderRadius: 8 }} />
            <Legend verticalAlign="bottom" iconSize={12} wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
            <Line dataKey="acuracia" name="Acurácia real" type="monotone" stroke={atlasCores.blue} strokeWidth={3} dot={{ r: 3, fill: atlasCores.success }} connectNulls={false} isAnimationActive={false} />
            <Line dataKey="tendencia" name="Tendência" type="linear" stroke={atlasCores.warning} strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls={false} isAnimationActive={false} />
            <Line dataKey="projecao" name="Projeção" type="linear" stroke={atlasCores.danger} strokeWidth={2} strokeDasharray="2 3" dot={{ r: 3, fill: atlasCores.danger }} connectNulls={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{inclinacao == null || projecao5 == null ? "Histórico insuficiente para projeção." : `Inclinação: ${inclinacao > 0 ? "+" : ""}${inclinacao.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} p.p./dia · Projeção em 5 dias: ~${projecao5.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% de acurácia`}</p>
    </CardContent>
  </Card>;
}