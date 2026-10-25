// Filtros de mês e almoxarifado dos painéis de inventário do Atlas.
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const mesRot = (m: string) => `${m.slice(5)}/${m.slice(0, 4)}`;

export function FiltrosInv({ almox, setAlmox, mes, setMes, op }: { almox: string | null; setAlmox: (v: string | null) => void; mes: string | null; setMes: (v: string | null) => void; op: { almox: string[]; meses: string[] } }) {
  return (
    <div className="flex gap-2">
      <Select value={mes ?? "todos"} onValueChange={(v) => setMes(v === "todos" ? null : v)}><SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os meses</SelectItem>{op.meses.map((m) => <SelectItem key={m} value={m}>{mesRot(m)}</SelectItem>)}</SelectContent></Select>
      <Select value={almox ?? "todos"} onValueChange={(v) => setAlmox(v === "todos" ? null : v)}><SelectTrigger className="h-8 w-52"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os almoxarifados</SelectItem>{op.almox.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent></Select>
    </div>
  );
}
