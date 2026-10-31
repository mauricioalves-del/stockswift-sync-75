import { useState } from "react";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function CentroCustoEdit({ tabela, id, valor, nome, podeEditar, onSaved }: {
  tabela: "contexto_baixa_opcoes" | "origens"; id: string; valor: string | null;
  nome: string; podeEditar: boolean; onSaved: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);
  async function salvar() {
    setSalvando(true);
    const { error } = await supabase.from(tabela).update({ centro_custo: texto.trim() || null }).eq("id", id);
    setSalvando(false);
    if (error) return toast.error(error.message);
    setEditando(false);
    onSaved();
    toast.success("Centro de custo atualizado");
  }
  if (editando) return <div className="flex min-w-56 items-center gap-1">
    <Input aria-label={`Centro de custo de ${nome}`} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Código - descrição" autoFocus disabled={salvando} onKeyDown={(e) => { if (e.key === "Enter") void salvar(); if (e.key === "Escape") setEditando(false); }} />
    <Button size="icon" variant="ghost" aria-label={`Salvar centro de custo de ${nome}`} title="Salvar centro de custo" disabled={salvando} onClick={salvar}>{salvando ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}</Button>
    <Button size="icon" variant="ghost" aria-label="Cancelar centro de custo" title="Cancelar" disabled={salvando} onClick={() => setEditando(false)}><X className="size-4" /></Button>
  </div>;
  return <div className="flex items-center gap-2"><span className="text-sm">{valor || "Não definido"}</span>{podeEditar && <Button size="icon" variant="ghost" aria-label={`Editar centro de custo de ${nome}`} title="Editar centro de custo" onClick={() => { setTexto(valor || ""); setEditando(true); }}><Pencil className="size-4" /></Button>}</div>;
}