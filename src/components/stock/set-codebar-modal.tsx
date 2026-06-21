"use client";

import { useState, useTransition } from "react";
import dynamic from "next/dynamic";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScanBarcode, X, Barcode } from "lucide-react";
import { toast } from "sonner";
import { updateProduct } from "@/actions/stock";

const Scanner = dynamic(
  () => import("@yudiel/react-qr-scanner").then((m) => m.Scanner),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 w-64 bg-black flex items-center justify-center text-white">
        Cargando escáner...
      </div>
    ),
  },
);

interface Props {
  productId: string;
  currentCodebar?: string;
  onSuccess?: (codebar: string) => void;
}

const SetCodebarModal = ({ productId, currentCodebar, onSuccess }: Props) => {
  const [open, setOpen] = useState(false);
  const [codebar, setCodebar] = useState(currentCodebar || "");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSave = () => {
    if (!codebar.trim()) {
      toast.error("Ingresá un código de barras válido.");
      return;
    }

    startTransition(async () => {
      const result = await updateProduct(productId, { codebar: codebar.trim() });
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Código de barras guardado correctamente.");
        onSuccess?.(codebar.trim());
        setOpen(false);
      }
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => e.stopPropagation()}
            title="Asignar código de barras"
            className="h-8 w-8 text-purple-600 hover:text-purple-700 hover:bg-purple-50 dark:hover:bg-purple-900/20"
          >
            <Barcode className="h-4 w-4" />
          </Button>
        </DialogTrigger>

        <DialogContent className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Asignar Código de Barras</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="codebar-input">Código de Barras</Label>
              <div className="flex gap-2">
                <Input
                  id="codebar-input"
                  value={codebar}
                  onChange={(e) => setCodebar(e.target.value)}
                  placeholder="Ej: 7790001234567"
                  disabled={isPending}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSave();
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setScannerOpen(true)}
                  className="h-10 w-10 shrink-0 text-gray-500 hover:text-black"
                  title="Escanear código de barras"
                  disabled={isPending}
                >
                  <ScanBarcode className="h-5 w-5" />
                </Button>
              </div>
              {currentCodebar && (
                <p className="text-xs text-muted-foreground">
                  Código actual: <span className="font-mono">{currentCodebar}</span>
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isPending || !codebar.trim()}>
              {isPending ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Camera Scanner Overlay */}
      {scannerOpen && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex flex-col items-center justify-center p-4">
          <Button
            variant="ghost"
            className="absolute top-4 right-4 text-white hover:bg-white/20 rounded-full h-12 w-12 p-0"
            onClick={() => setScannerOpen(false)}
          >
            <X className="h-6 w-6" />
          </Button>

          <div className="w-full max-w-sm">
            <div className="text-center mb-6">
              <h3 className="text-white text-xl font-semibold">Escanear código</h3>
              <p className="text-gray-400 text-sm mt-1">
                Apuntá la cámara al código de barras
              </p>
            </div>

            <div className="aspect-square bg-black rounded-2xl overflow-hidden relative border-2 border-white/20 shadow-2xl">
              <Scanner
                formats={["code_128", "codabar", "qr_code", "ean_13", "ean_8"]}
                onScan={(result) => {
                  if (result && result.length > 0) {
                    const rawValue = result[0].rawValue;
                    setCodebar(rawValue);
                    setScannerOpen(false);
                    toast.success(`Código escaneado: ${rawValue}`);
                  }
                }}
              />
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-56 h-32 border-2 border-green-400/70 rounded-lg" />
                <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-green-400/30" />
              </div>
            </div>

            <div className="mt-6 flex justify-center gap-4">
              <Button
                variant="outline"
                onClick={() => setScannerOpen(false)}
                className="bg-transparent text-white border-white/30 hover:bg-white/10"
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SetCodebarModal;
