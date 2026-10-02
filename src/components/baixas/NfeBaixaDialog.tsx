import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { MultiSelect } from "@/components/ui/multi-select";
import { useUsuariosSistema } from "@/hooks/useUsuariosSistema";
import { notificarBaixaNfe } from "@/lib/baixa-nfe.functions";

/** Pop exibido após a aprovação final: registra dados da NF-e de baixa e notifica usuários. */
export function NfeBaixaDialog({ ids, onClose }: { ids: string[] | null; onClose: () => void }) {
  const usuarios = useUsuariosSistema();
  const notificar = useServerFn(notificarBaixaNfe);
  const [numero, setNumero] = useState("");
  const [serie, setSerie] = useState("");
  const [chave, setChave] = useState("");
  const [dataNf, setDataNf] = useState("");
  const [obs, setObs] = useState("");
  const [notif, setNotif] = useState(false);
  const [userIds, setUserIds] = useState<string[]>([]);
  const [mensagem, setMensagem] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (ids) {
      setNumero(""); setSerie(""); setChave(""); setObs(""); setMensagem("");
      setDataNf(new Date().toISOString().slice(0, 10));
      setNotif(false); setUserIds([]);
    }
  }, [ids]);

  async function salvar() {
    if (!ids) return;
    if (!numero.trim()) return toast.error("Informe o número da NF-e de baixa");
    if (notif && userIds.length === 0) return toast.error("Selecione ao menos um usuário para notificar");
    setSalvando(true);
    try {
      const nfe = {
        numero: numero.trim(), serie: serie.trim() || null, chave: chave.replace(/\s/g, "") || null,
        data: dataNf || null, observacao: obs.trim() || null,
      };
      const { error } = await (supabase as any).from("baixa_operacional").update({
        nfe_baixa_numero: nfe.numero, nfe_baixa_serie: nfe.serie, nfe_baixa_chave: nfe.chave,
        nfe_baixa_data: nfe.data, nfe_baixa_observacao: nfe.observacao,
      }).in("id", ids);
      if (error) throw error;
      toast.success(`NF-e registrada em ${ids.length} item(ns)`);
      if (notif) {
        const r: any = await notificar({ data: { ids, userIds, nfe, mensagem: mensagem.trim() || null } });
        if (r?.ok) toast.success(`Notificação enviada a ${r.destinatarios} usuário(s)`);
        else toast.error(r?.error ?? "Falha ao notificar");
      }
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao salvar");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={!!ids} onOpenChange={(o) => !o && !salvando && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Dados da Baixa Fiscal</DialogTitle>
          <DialogDescription>Registre a NF-e de baixa dos {ids?.length ?? 0} item(ns) aprovados.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2 space-y-1">
            <Label>Número da NF-e *</Label>
            <Input value={numero} onChange={(e) => setNumero(e.target.value)} maxLength={20} />
          </div>
          <div className="space-y-1">
            <Label>Série</Label>
            <Input value={serie} onChange={(e) => setSerie(e.target.value)} maxLength={5} />
          </div>
          <div className="col-span-2 space-y-1">
            <Label>Chave de acesso</Label>
            <Input value={chave} onChange={(e) => setChave(e.target.value)} maxLength={60} placeholder="44 dígitos" />
          </div>
          <div className="space-y-1">
            <Label>Data de emissão</Label>
            <Input type="date" value={dataNf} onChange={(e) => setDataNf(e.target.value)} />
          </div>
          <div className="col-span-3 space-y-1">
            <Label>Observação</Label>
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} maxLength={1000} rows={2} />
          </div>
        </div>
        <div className="space-y-2 border-t pt-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={notif} onCheckedChange={(v) => setNotif(!!v)} /> Notificar usuários por e-mail
          </label>
          {notif && (
            <>
              <MultiSelect
                options={(usuarios.data ?? []).filter((u) => u.email).map((u) => ({ value: u.id, label: u.nome }))}
                value={userIds}
                onChange={setUserIds}
                placeholder="Selecionar usuários…"
              />
              <Textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} maxLength={1000} rows={2} placeholder="Mensagem (opcional)" />
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={salvando}>Pular</Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando && <Loader2 className="size-4 mr-2 animate-spin" />} Salvar{notif ? " e notificar" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
