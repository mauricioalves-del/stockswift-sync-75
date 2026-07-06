import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Camera, CameraOff, RotateCw, Save, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { sounds } from "@/lib/audio";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { addPendingCount } from "@/lib/idb";
import { syncPendingCounts } from "@/lib/sync";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { extrairCodigoNumericoQR } from "@/lib/qr-estoque";
import { useAlmoxAtivo } from "@/lib/almox-inventario";
import { AlertTriangle, Warehouse } from "lucide-react";

export const Route = createFileRoute("/_authenticated/scanner")({
  ssr: false,
  component: ScannerPage,
  head: () => ({ meta: [{ title: "Scanner" }] }),
});

interface Hit {
  id: string;
  id_produto: string;
  lote: string;
  descricao: string;
  unidade: string;
  id_local: string;
  quantidade: number;
  custo_unitario: number;
  data_validade: string | null;
}

function ScannerPage() {
  const online = useOnlineStatus();
  const qc = useQueryClient();
  const elId = "scanner-region";
  const scannerRef = useRef<unknown>(null);
  const [active, setActive] = useState(false);
  const [cameraId, setCameraId] = useState<string | null>(null);
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [hits, setHits] = useState<Hit[]>([]);
  const [selected, setSelected] = useState<Hit | null>(null);
  const [contado, setContado] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastCode, setLastCode] = useState<string>("");
  const { data: almoxInfo } = useAlmoxAtivo();

  useEffect(() => {
    return () => {
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startScanner(camId?: string) {
    try {
      const mod = await import("html5-qrcode");
      const { Html5Qrcode } = mod;
      const allCams = await Html5Qrcode.getCameras();
      setCameras(allCams.map((c) => ({ id: c.id, label: c.label || c.id })));
      const useId = camId ?? allCams[allCams.length - 1]?.id;
      if (!useId) { toast.error("Nenhuma câmera disponível"); return; }
      setCameraId(useId);
      const scanner = new Html5Qrcode(elId);
      scannerRef.current = scanner;
      await scanner.start(
        useId,
        { fps: 12, qrbox: { width: 260, height: 160 } },
        (text) => onScan(text),
        () => {},
      );
      setActive(true);
    } catch (err) {
      console.error(err);
      toast.error("Falha ao iniciar câmera. Permita o acesso.");
    }
  }

  async function stopScanner() {
    const s = scannerRef.current as { stop?: () => Promise<void>; clear?: () => void } | null;
    if (s?.stop) { try { await s.stop(); } catch { /* noop */ } }
    if (s?.clear) { try { s.clear(); } catch { /* noop */ } }
    scannerRef.current = null;
    setActive(false);
  }

  async function switchCamera() {
    if (cameras.length < 2) { toast.info("Apenas uma câmera disponível"); return; }
    const idx = cameras.findIndex((c) => c.id === cameraId);
    const next = cameras[(idx + 1) % cameras.length];
    await stopScanner();
    await startScanner(next.id);
  }

  async function onScan(code: string) {
    if (code === lastCode) return;
    setLastCode(code);
    sounds.scan();
    const numeric = extrairCodigoNumericoQR(code);
    if (!numeric) {
      toast.error("Nenhum código numérico identificado no QR");
      sounds.error();
      setTimeout(() => setLastCode(""), 1500);
      return;
    }
    const { data } = await supabase
      .from("estoque_sistemico")
      .select("*")
      .or(`id_produto.eq.${numeric},lote.eq.${numeric}`)
      .limit(20);
    const list = (data ?? []) as Hit[];
    if (list.length === 0) {
      toast.error(`Produto ${numeric} não encontrado`);
      sounds.error();
      setTimeout(() => setLastCode(""), 1500);
      return;
    }
    setHits(list);
    if (list.length === 1) setSelected(list[0]);
    setTimeout(() => setLastCode(""), 2500);
  }

  async function handleSave() {
    if (!selected) return;
    const q = Number(contado.replace(",", "."));
    if (Number.isNaN(q) || q < 0) { toast.error("Quantidade inválida"); return; }
    setSaving(true);
    const userId = (await supabase.auth.getUser()).data.user?.id ?? "";
    const { data: last } = await supabase.from("inventario")
      .select("contagem_numero").eq("id_produto", selected.id_produto).eq("lote", selected.lote)
      .order("contagem_numero", { ascending: false }).limit(1);
    const contagem_numero = (last?.[0]?.contagem_numero ?? 0) + 1;
    const payload = {
      id_produto: selected.id_produto,
      lote: selected.lote,
      descricao: selected.descricao,
      unidade: selected.unidade,
      id_local: selected.id_local,
      custo_unitario: Number(selected.custo_unitario),
      saldo_sistemico: Number(selected.quantidade),
      quantidade_contada: q,
      data_validade: selected.data_validade,
      contagem_numero,
      usuario: userId,
      observacao: null,
      data_contagem: new Date().toISOString(),
    };
    if (online) {
      const { error } = await supabase.from("inventario").insert(payload);
      if (error) await addPendingCount({ ...payload, localId: crypto.randomUUID(), createdAt: Date.now() });
    } else {
      await addPendingCount({ ...payload, localId: crypto.randomUUID(), createdAt: Date.now() });
    }
    toast.success(`Contagem registrada (${q} ${selected.unidade})`);
    sounds.success();
    qc.invalidateQueries({ queryKey: ["inventario"] });
    qc.invalidateQueries({ queryKey: ["pending-counts"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    setSelected(null);
    setHits([]);
    setContado("");
    setSaving(false);
    if (online) syncPendingCounts();
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Scanner de Código de Barras</h1>
        <p className="text-sm text-muted-foreground">EAN13, CODE128, QR e Datamatrix</p>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div id={elId} className="w-full aspect-[4/3] bg-black rounded-lg overflow-hidden" />
          <div className="flex flex-wrap gap-2">
            {!active ? (
              <Button onClick={() => startScanner()} className="flex-1"><Camera className="size-4 mr-1.5" /> Ativar câmera</Button>
            ) : (
              <>
                <Button variant="outline" onClick={switchCamera}><RotateCw className="size-4 mr-1.5" /> Trocar</Button>
                <Button variant="destructive" onClick={stopScanner} className="flex-1"><CameraOff className="size-4 mr-1.5" /> Fechar</Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {hits.length > 1 && !selected && (
        <Card>
          <CardContent className="p-3">
            <div className="text-sm font-medium mb-2">Selecione o lote:</div>
            <div className="space-y-1">
              {hits.map((h) => (
                <button key={h.id} onClick={() => setSelected(h)} className="w-full text-left p-2 rounded border hover:bg-accent">
                  <div className="font-medium text-sm">{h.descricao || h.id_produto}</div>
                  <div className="text-xs text-muted-foreground">Lote {h.lote} · {h.quantidade} {h.unidade} · {h.id_local}</div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {selected && (
        <Card className="border-primary/40">
          <CardContent className="p-4 space-y-3">
            <div>
              <div className="font-semibold">{selected.descricao || selected.id_produto}</div>
              <div className="text-xs text-muted-foreground font-mono">{selected.id_produto} · Lote {selected.lote || "—"} · {selected.id_local}</div>
            </div>
            <div className="flex justify-between items-center bg-muted rounded p-2">
              <span className="text-xs">Saldo sistêmico</span>
              <Badge variant="secondary" className="tabular-nums">{selected.quantidade} {selected.unidade}</Badge>
            </div>
            <div>
              <Label htmlFor="qs">Quantidade contada</Label>
              <Input id="qs" type="number" inputMode="decimal" step="0.001" min="0" value={contado} onChange={(e) => setContado(e.target.value)} autoFocus className="h-14 text-2xl text-center font-bold tabular-nums" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setSelected(null); setHits([]); setContado(""); }}>Cancelar</Button>
              <Button className="flex-1" onClick={handleSave} disabled={saving || !contado}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <><Save className="size-4 mr-1.5" /> Salvar</>}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
