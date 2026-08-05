import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  mensagem: string | null;
  onClose: () => void;
};

/** Fallback quando a cópia automática para a área de transferência falha. */
export function WhatsAppFallbackDialog({ mensagem, onClose }: Props) {
  return (
    <Dialog open={!!mensagem} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Copiar mensagem do WhatsApp</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Não foi possível copiar automaticamente. Copie o texto abaixo e cole no grupo Colaboradores no WhatsApp Web.
        </p>
        <Textarea rows={14} readOnly value={mensagem ?? ""} className="font-mono text-xs" />
        <DialogFooter>
          <Button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(mensagem ?? "");
                toast.success("Mensagem copiada!");
                onClose();
              } catch {
                toast.error("Copie manualmente selecionando o texto acima.");
              }
            }}
          >
            Copiar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
