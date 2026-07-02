import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
}

export function BarcodeScanner({ open, onClose, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | undefined>();

  useEffect(() => {
    if (!open) return;
    setError(null);
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39, BarcodeFormat.QR_CODE, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
    ]);
    const reader = new BrowserMultiFormatReader(hints);
    let cancelled = false;

    (async () => {
      try {
        const list = await BrowserMultiFormatReader.listVideoInputDevices();
        if (cancelled) return;
        setDevices(list);
        const preferred = list.find((d) => /back|rear|traseira|environment/i.test(d.label))?.deviceId
          ?? list[list.length - 1]?.deviceId;
        const useId = deviceId ?? preferred;
        setDeviceId(useId);
        const controls = await reader.decodeFromVideoDevice(useId, videoRef.current!, (result) => {
          if (result) {
            onDetected(result.getText());
            controls.stop();
          }
        });
        controlsRef.current = controls;
      } catch (e: any) {
        setError(e?.message ?? "Não foi possível acessar a câmera");
      }
    })();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, deviceId]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Camera className="size-5" /> Escanear código</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative aspect-square bg-black rounded-md overflow-hidden">
            <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
            <div className="absolute inset-8 border-2 border-primary/70 rounded-lg pointer-events-none" />
          </div>
          {error && <div className="text-sm text-destructive">{error}</div>}
          {devices.length > 1 && (
            <select
              className="w-full text-sm border rounded-md px-2 py-1.5 bg-background"
              value={deviceId ?? ""}
              onChange={(e) => setDeviceId(e.target.value)}
            >
              {devices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || "Câmera"}</option>)}
            </select>
          )}
          <p className="text-xs text-muted-foreground">Aponte a câmera para o EAN13, CODE128 ou QR Code.</p>
          <Button variant="outline" className="w-full gap-2" onClick={onClose}><X className="size-4" /> Cancelar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
