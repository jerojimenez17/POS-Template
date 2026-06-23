"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import JsBarcode from "jsbarcode";
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
import { Barcode, ScanBarcode, Printer, X } from "lucide-react";
import { toast } from "sonner";
import { printElement } from "@/lib/print";
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

const UNIT_SUFFIX_MAP: Record<string, string> = {
  Unidad: "/u",
  Kg: "/kg",
  Gramo: "/g",
  Litro: "/l",
  Metro: "/m",
};

function getUnitSuffix(unit?: string): string {
  if (!unit) return "/u";
  return UNIT_SUFFIX_MAP[unit] ?? "/u";
}

function formatPrice(price: number, unitSuffix: string): string {
  return `$${price.toFixed(2)}${unitSuffix}`;
}

interface Props {
  productId: string;
  code: string;
  codebar?: string | null;
  description: string;
  salePrice: number;
  unit?: string | null;
  onSuccess?: (codebar: string) => void;
}

type Mode = "generate" | "print";

export default function BarcodeModal({
  productId,
  code,
  codebar,
  description,
  salePrice,
  unit,
  onSuccess,
}: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("generate");
  const [barcodeInput, setBarcodeInput] = useState(codebar || "");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [generatedBarcode, setGeneratedBarcode] = useState<string | null>(
    codebar || null
  );
  const [isPending, startTransition] = useTransition();
  const [copies, setCopies] = useState(1);
  const [printKey, setPrintKey] = useState(0);

  const barcodeRefs = useRef<(SVGSVGElement | null)[]>([]);
  const printRef = useRef<HTMLDivElement>(null);

  // The barcode value to render (falls back to internal code for display)
  const barcodeValue = generatedBarcode || codebar || code;

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setMode(generatedBarcode || codebar ? "print" : "generate");
      setBarcodeInput(codebar || "");
      setCopies(1);
      setPrintKey(0);
    }
  }, [open, codebar, generatedBarcode]);
  const unitSuffix = getUnitSuffix(unit ?? undefined);
  const formattedPrice = formatPrice(salePrice, unitSuffix);

  const generateBarcodes = useCallback(() => {
    barcodeRefs.current.forEach((barcodeEl) => {
      if (barcodeEl && barcodeValue) {
        JsBarcode(barcodeEl, barcodeValue, {
          format: "CODE128",
          lineColor: "#000000",
          width: 2,
          height: 60,
          displayValue: true,
          fontSize: 10,
          margin: 0,
        });
      }
    });
  }, [barcodeValue]);

  useEffect(() => {
    if (open && (mode === "print" || (mode === "generate" && generatedBarcode))) {
      generateBarcodes();
    }
  }, [open, mode, generatedBarcode, printKey, generateBarcodes]);

  const handleSaveBarcode = () => {
    if (!barcodeInput.trim()) {
      toast.error("Ingresá un código de barras válido.");
      return;
    }

    startTransition(async () => {
      const result = await updateProduct(productId, { codebar: barcodeInput.trim() });
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Código de barras guardado correctamente.");
        setGeneratedBarcode(barcodeInput.trim());
        setMode("print");
        onSuccess?.(barcodeInput.trim());
      }
    });
  };

  const handleCopiesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value)) {
      setCopies(Math.max(1, Math.min(50, value)));
    }
  };

  const handlePrint = async () => {
    if (printRef.current) {
      await printElement(printRef.current, {
        documentTitle: `CodigoBarras_${barcodeValue}`,
        pageStyle: `
          @page { size: 80mm auto; margin: 0; }
          @media print {
            body { -webkit-print-color-adjust: exact; }
            .no-print { display: none !important; }
          }
        `,
        format: "thermal",
      });
    }
  };

  const cards = Array.from({ length: copies }, (_, i) => i);

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => e.stopPropagation()}
            title={codebar ? "Código de barras" : "Asignar código de barras"}
            className={codebar ? "" : "text-purple-600 hover:text-purple-700 hover:bg-purple-50 dark:hover:bg-purple-900/20"}
          >
            <Barcode className="h-4 w-4" />
          </Button>
        </DialogTrigger>

        <DialogContent
          className="w-full max-w-md"
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <Barcode className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <DialogTitle>
                  {generatedBarcode || codebar
                    ? "Código de Barras"
                    : "Asignar Código de Barras"}
                </DialogTitle>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {description}
                </p>
              </div>
            </div>
          </DialogHeader>

          {/* GENERATE MODE: Input + Scanner */}
          {mode === "generate" && (
            <div className="flex flex-col gap-4 py-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="barcode-input">Código de Barras</Label>
                <div className="flex gap-2">
                  <Input
                    id="barcode-input"
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    placeholder="Ej: 7790001234567"
                    disabled={isPending}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveBarcode();
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
                {codebar && (
                  <p className="text-xs text-muted-foreground">
                    Código actual: <span className="font-mono">{codebar}</span>
                  </p>
                )}
              </div>

              <DialogFooter className="gap-2 pt-2">
                <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
                  Cancelar
                </Button>
                <Button onClick={handleSaveBarcode} disabled={isPending || !barcodeInput.trim()}>
                  {isPending ? "Guardando..." : "Guardar"}
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* PRINT MODE: Barcode preview + copies + print */}
          {(mode === "print" || generatedBarcode) && barcodeValue && (
            <div className="flex flex-col gap-4 py-4">
              <div className="flex items-center gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="copies">Cantidad de copias</Label>
                  <Input
                    id="copies"
                    type="number"
                    min={1}
                    max={50}
                    value={copies}
                    onChange={handleCopiesChange}
                    className="w-24"
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPrintKey((k) => k + 1);
                  }}
                  className="mt-5"
                >
                  Generar
                </Button>
              </div>

              <div className="no-print border rounded-md p-4 bg-slate-50 max-h-96 overflow-y-auto">
                <div
                  ref={printRef}
                  className="mx-auto grid gap-3"
                  style={{
                    gridTemplateColumns: "repeat(auto-fill, minmax(70mm, 1fr))",
                    width: "100%",
                  }}
                >
                  {cards.map((_, index) => (
                    <div
                      key={index}
                      className="flex flex-col text-black items-center border border-dashed border-gray-300 rounded p-2 bg-white"
                      style={{ width: "70mm" }}
                    >
                      <div className="text-center font-semibold text-sm mb-1 truncate w-full">
                        {description}
                      </div>
                      <svg
                        ref={(el) => { barcodeRefs.current[index] = el; }}
                        className="w-full"
                      />
                      <div className="text-center font-bold text-lg mt-1">
                        {formattedPrice}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="submit"
                  className="gap-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePrint();
                  }}
                >
                  <Printer className="h-4 w-4" />
                  Imprimir
                </Button>
              </DialogFooter>
            </div>
          )}
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
                    setBarcodeInput(rawValue);
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
}
