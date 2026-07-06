import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Trash2, Loader2, AlertTriangle, Download } from "lucide-react";

type Escopo = "TUDO" | "PERIODO" | "LOCAL" | "MISSAO";

export function LimparContagemDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [escopo, setEscopo] = useState<Escopo>("TUDO");
  const [dataIni, setDataIni] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [local, setLocal] = useState("");
  const [missaoId, setMissaoId] = useState("");
  const [ciente, setCiente] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  const locaisQ = useQuery({
    queryKey: ["contar-locais"],
    queryFn: async () => {
      const { data } = await supabase.from("locais").select("nome").eq("ativo", true).order("nome");
      return (data ?? []).map((r: any) => r.nome as string);
    },
    enabled: open,
  });

  const missoesQ = useQuery({
    queryKey: ["contar-missoes"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("missoes").select("id, titulo, data_execucao").order("data_execucao", { ascending: false }).limit(200);
      return (data ?? []) as any[];
    },
    enabled: open,
  });

  async function buildFilter() {
    // Retorna array de códigos ou null se filtro extra por SKU não se aplica
    if (escopo === "MISSAO" && missaoId) {
      const { data } = await (supabase as any).from("missoes_itens").select("codigo_produto").eq("missao_id", missaoId);
      return (data ?? []).map((r: any) => r.codigo_produto as string);
    }
    return null;
  }

  function applyFilter(q: any) {
    if (escopo === "PERIODO") {
      if (dataIni) q = q.gte("data_contagem", dataIni + "T00:00:00");
      if (dataFim) q = q.lte("data_contagem", dataFim + "T23:59:59");
    } else if (escopo === "LOCAL" && local) {
      q = q.eq("id_local", local);
    }
    return q;
  }

  const previewQ = useQuery({
    queryKey: ["limpar-preview", escopo, dataIni, dataFim, local, missaoId],
    queryFn: async () => {
      const skus = await buildFilter();
      let inv = supabase.from("inventario").select("id", { count: "exact", head: true });
      inv = applyFilter(inv);
      if (skus) {
        if (skus.length === 0) return { inv: 0, rec: 0 };
        inv = inv.in("id_produto", skus);
      }
      const { count: invCount } = await inv;

      let rec = supabase.from("recontagem").select("id", { count: "exact", head: true });
      if (escopo === "PERIODO") {
        if (dataIni) rec = rec.gte("created_at", dataIni + "T00:00:00");
        if (dataFim) rec = rec.lte("created_at", dataFim + "T23:59:59");
      } else if (escopo === "LOCAL" && local) {
        rec = rec.eq("id_local", local);
      }
      if (skus) {
        if (skus.length === 0) return { inv: invCount ?? 0, rec: 0 };
        rec = rec.in("codigo_produto", skus);
      }
      const { count: recCount } = await rec;

      return { inv: invCount ?? 0, rec: recCount ?? 0 };
    },
    enabled: open,
  });

  const valido = useMemo(() => {
    if (!ciente || confirmText.trim().toUpperCase() !== "CONFIRMAR") return false;
    if (escopo === "PERIODO" && !dataIni && !dataFim) return false;
    if (escopo === "LOCAL" && !local) return false;
    if (escopo === "MISSAO" && !missaoId) return false;
    return true;
  }, [ciente, confirmText, escopo, dataIni, dataFim, local, missaoId]);

  function toCSV(rows: any[]): string {
    if (rows.length === 0) return "";
    const cols = Object.keys(rows[0]);
    const esc = (v: any) => {
      if (v === null || v === undefined) return "";
      const s = String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
  }

  function download(name: string, content: string) {
    if (!content) return;
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  }

  async function executar() {
    setBusy(true);
    try {
      const me = (await supabase.auth.getUser()).data.user?.id;
      const skus = await buildFilter();
      const loteId = crypto.randomUUID();
      const motivo = escopoLabel();

      // -------- INVENTÁRIO --------
      let invQ = supabase.from("inventario").select("*");
      invQ = applyFilter(invQ);
      if (skus) invQ = skus.length ? invQ.in("id_produto", skus) : (invQ as any).eq("id_produto", "__none__");
      const { data: invRows, error: invErr } = await invQ;
      if (invErr) throw invErr;

      // Backup CSV
      download(`inventario_arquivado_${new Date().toISOString().slice(0, 19)}.csv`, toCSV(invRows ?? []));

      if ((invRows ?? []).length > 0) {
        const invArq = (invRows as any[]).map((r) => ({
          inventario_id: r.id,
          id_produto: r.id_produto, lote: r.lote, descricao: r.descricao, unidade: r.unidade,
          id_local: r.id_local, custo_unitario: r.custo_unitario, saldo_sistemico: r.saldo_sistemico,
          quantidade_contada: r.quantidade_contada, acuracidade: r.acuracidade, divergencia: r.divergencia,
          valor_divergencia: r.valor_divergencia, status: r.status, contagem_numero: r.contagem_numero,
          usuario: r.usuario, data_contagem: r.data_contagem, data_validade: r.data_validade,
          sincronizado: r.sincronizado, observacao: r.observacao, aprovado_por: r.aprovado_por,
          aprovado_em: r.aprovado_em, origem: r.origem,
          arquivado_por: me, motivo_arquivamento: motivo, escopo_lote: loteId,
        }));
        // insere em chunks
        for (let i = 0; i < invArq.length; i += 500) {
          const slice = invArq.slice(i, i + 500);
          const { error } = await (supabase as any).from("inventario_arquivado").insert(slice);
          if (error) throw error;
        }
        const ids = (invRows as any[]).map((r) => r.id);
        for (let i = 0; i < ids.length; i += 500) {
          const slice = ids.slice(i, i + 500);
          const { error } = await supabase.from("inventario").delete().in("id", slice);
          if (error) throw error;
        }
      }

      // -------- RECONTAGEM --------
      let recQ = supabase.from("recontagem").select("*");
      if (escopo === "PERIODO") {
        if (dataIni) recQ = recQ.gte("created_at", dataIni + "T00:00:00");
        if (dataFim) recQ = recQ.lte("created_at", dataFim + "T23:59:59");
      } else if (escopo === "LOCAL" && local) {
        recQ = recQ.eq("id_local", local);
      }
      if (skus) recQ = skus.length ? recQ.in("codigo_produto", skus) : (recQ as any).eq("codigo_produto", "__none__");
      const { data: recRows, error: recErr } = await recQ;
      if (recErr) throw recErr;

      download(`recontagem_arquivada_${new Date().toISOString().slice(0, 19)}.csv`, toCSV(recRows ?? []));

      if ((recRows ?? []).length > 0) {
        const recArq = (recRows as any[]).map((r) => ({
          recontagem_id: r.id, inventario_id: r.inventario_id, codigo_produto: r.codigo_produto,
          lote: r.lote, descricao: r.descricao, id_local: r.id_local, saldo_sistema: r.saldo_sistema,
          contagem: r.contagem, acuracidade: r.acuracidade, status: r.status, usuario: r.usuario,
          aprovado_por: r.aprovado_por, aprovado_em: r.aprovado_em, motivo: r.motivo, origem: r.origem,
          arquivado_por: me, motivo_arquivamento: motivo, escopo_lote: loteId,
        }));
        for (let i = 0; i < recArq.length; i += 500) {
          const slice = recArq.slice(i, i + 500);
          const { error } = await (supabase as any).from("recontagem_arquivada").insert(slice);
          if (error) throw error;
        }
        const ids = (recRows as any[]).map((r) => r.id);
        for (let i = 0; i < ids.length; i += 500) {
          const slice = ids.slice(i, i + 500);
          const { error } = await supabase.from("recontagem").delete().in("id", slice);
          if (error) throw error;
        }
      }

      // Auditoria
      await supabase.from("audit_logs").insert({
        usuario: me, acao: "LIMPAR_CONTAGENS", entidade: "inventario",
        payload: {
          escopo, dataIni, dataFim, local, missaoId,
          inventario_afetados: (invRows ?? []).length,
          recontagem_afetados: (recRows ?? []).length,
          lote: loteId,
        },
      });

      toast.success(`Arquivadas ${(invRows ?? []).length} contagens e ${(recRows ?? []).length} recontagens. CSV baixado.`);
      qc.invalidateQueries({ queryKey: ["inventario"] });
      qc.invalidateQueries({ queryKey: ["recontagem"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      setOpen(false);
      setCiente(false); setConfirmText(""); setEscopo("TUDO");
    } catch (err: any) {
      toast.error(err.message ?? "Falha ao arquivar");
    } finally {
      setBusy(false);
    }
  }

  function escopoLabel() {
    if (escopo === "TUDO") return "Limpeza total de contagens";
    if (escopo === "PERIODO") return `Período ${dataIni || "…"} → ${dataFim || "…"}`;
    if (escopo === "LOCAL") return `Local: ${local}`;
    if (escopo === "MISSAO") {
      const m = missoesQ.data?.find((x: any) => x.id === missaoId);
      return `Missão: ${m?.titulo ?? missaoId}`;
    }
    return "";
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-destructive border-destructive/40 hover:bg-destructive/10">
          <Trash2 className="size-4 mr-1.5" /> Limpar Dados
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-destructive" /> Limpar Dados de Contagem
          </DialogTitle>
          <DialogDescription>
            Arquiva (move para tabelas de backup) e remove as contagens e recontagens do escopo selecionado. Um CSV é baixado antes da remoção.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Escopo</Label>
            <RadioGroup value={escopo} onValueChange={(v) => setEscopo(v as Escopo)} className="grid grid-cols-2 gap-2 mt-1">
              {[
                { v: "TUDO", l: "Tudo" },
                { v: "PERIODO", l: "Por período" },
                { v: "LOCAL", l: "Por local" },
                { v: "MISSAO", l: "Por missão" },
              ].map((o) => (
                <label key={o.v} className="flex items-center gap-2 border rounded-md px-2 py-1.5 text-sm cursor-pointer hover:bg-muted">
                  <RadioGroupItem value={o.v} />{o.l}
                </label>
              ))}
            </RadioGroup>
          </div>

          {escopo === "PERIODO" && (
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">De</Label><Input type="date" value={dataIni} onChange={(e) => setDataIni(e.target.value)} /></div>
              <div><Label className="text-xs">Até</Label><Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} /></div>
            </div>
          )}

          {escopo === "LOCAL" && (
            <div>
              <Label className="text-xs">Local</Label>
              <Select value={local} onValueChange={setLocal}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {(locaisQ.data ?? []).map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {escopo === "MISSAO" && (
            <div>
              <Label className="text-xs">Missão</Label>
              <Select value={missaoId} onValueChange={setMissaoId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {(missoesQ.data ?? []).map((m: any) => (
                    <SelectItem key={m.id} value={m.id}>{m.titulo} · {m.data_execucao ?? ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="rounded-md border bg-muted/40 p-2 text-xs">
            <div className="font-medium">Registros afetados</div>
            <div>Inventário: <span className="font-mono">{previewQ.data?.inv ?? "…"}</span></div>
            <div>Recontagem: <span className="font-mono">{previewQ.data?.rec ?? "…"}</span></div>
          </div>

          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <Checkbox checked={ciente} onCheckedChange={(v) => setCiente(!!v)} />
            <span>Estou ciente de que essa ação é irreversível (os dados vão para tabelas de arquivo).</span>
          </label>

          <div>
            <Label className="text-xs">Digite <b>CONFIRMAR</b> para liberar</Label>
            <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="CONFIRMAR" />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancelar</Button>
          <Button variant="destructive" onClick={executar} disabled={!valido || busy} className="gap-1.5">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            Baixar CSV + Arquivar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
