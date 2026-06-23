"use client";

import { useEffect, useRef, useState, useTransition, startTransition } from "react";
import dynamic from "next/dynamic";
import JsBarcode from "jsbarcode";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Barcode, ScanBarcode, Printer, X, Check, PenLine } from "lucide-react";
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

interface Props {
  productId: string;
  code: string;
  codebar?: string | null;
  description: string;
  salePrice: number;
  unit?: string | null;
  onSuccess?: (codebar: string) => void;
}

const UNIT_SUFFIX_MAP: Record<string, string> = {
  Unidad: "/u", Kg: "/kg", Gramo: "/g", Litro: "/l", Metro: "/m",
};

function formatPrice(price: number, unit?: string | null): string {
  const suffix = unit ? (UNIT_SUFFIX_MAP[unit] ?? "/u") : "/u";
  return `$${price.toFixed(2)}${suffix}`;
}

export default function BarcodeModal({
  productId,
  code,
  codebar: initialCodebar,
  description,
  salePrice,
  unit,
  onSuccess,
}: Props) {
  const [open, setOpen] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState(initialCodebar || "");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [savedCodebar, setSavedCodebar] = useState<string | null>(initialCodebar || null);
  const [isEditing, setIsEditing] = useState(!initialCodebar);
  const [isPending] = useTransition();
  const [copies, setCopies] = useState(1);

  const barcodeRefs = useRef<(SVGSVGElement | null)[]>([]);
  const printRef = useRef<HTMLDivElement>(null);

  const effectiveCodebar = savedCodebar || initialCodebar || code || null;

  // Generate SVGs
  useEffect(() => {
    if (!effectiveCodebar || !open) return;
    barcodeRefs.current.forEach((el) => {
      if (el) {
        JsBarcode(el, effectiveCodebar, {
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
  }, [effectiveCodebar, copies, open]);

  const handleSave = () => {
    if (!barcodeInput.trim()) return;
    startTransition(async () => {
      const result = await updateProduct(productId, { codebar: barcodeInput.trim() });
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Código guardado");
        setSavedCodebar(barcodeInput.trim());
        setIsEditing(false);
        onSuccess?.(barcodeInput.trim());
      }
    });
  };

  const handlePrint = async () => {
    if (printRef.current) {
      await printElement(printRef.current, {
        documentTitle: `CodigoBarras_${effectiveCodebar}`,
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
      <Dialog open={open} onOpenChange={(v) => {
        setOpen(v);
        if (v) {
          startTransition(() => {
            setCopies(1);
            setBarcodeInput(initialCodebar || "");
            setSavedCodebar(initialCodebar || null);
            setIsEditing(!initialCodebar);
          });
        }
      }}>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => e.stopPropagation()}
            title={initialCodebar ? "Código de barras" : "Asignar código"}
          >
            <Barcode className={`h-4 w-4 ${!initialCodebar ? "text-purple-600" : ""}`} />
          </Button>
        </DialogTrigger>

        <DialogContent
          className="max-w-sm p-0 gap-0 overflow-visible"
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Header ── */}
          <div className="flex items-center gap-3 px-5 pt-4 pb-3">
            <div className="p-1.5 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <Barcode className="h-4 w-4 text-blue-500" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Código de Barras
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {description}
              </p>
            </div>
          </div>

          <div className="border-t border-gray-100 dark:border-gray-800" />

          <div className="px-5 py-4 space-y-4">
            {/* ── Codebar section ── */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Código de barras
                </span>
                {effectiveCodebar && !isEditing && (
                  <button
                    type="button"
                    onClick={() => { setBarcodeInput(effectiveCodebar); setIsEditing(true); }}
                    className="text-xs text-blue-500 hover:text-blue-600 flex items-center gap-1 transition-colors"
                  >
                    <PenLine className="h-3 w-3" />
                    Editar
                  </button>
                )}
              </div>

              {isEditing ? (
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      value={barcodeInput}
                      onChange={(e) => setBarcodeInput(e.target.value)}
                      placeholder="Ej: 7790001234567"
                      disabled={isPending}
                      className="h-9 text-sm pr-9"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSave();
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setScannerOpen(true)}
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      title="Escanear"
                      disabled={isPending}
                    >
                      <ScanBarcode className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <Button
                    size="sm"
                    className="h-9 gap-1.5 text-xs shrink-0"
                    onClick={handleSave}
                    disabled={isPending || !barcodeInput.trim()}
                  >
                    <Check className="h-3.5 w-3.5" />
                    {isPending ? "Guardando..." : "Guardar"}
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <span className="text-xs text-gray-400 font-mono flex-1 truncate">
                    {effectiveCodebar}
                  </span>
                  <span className="text-[10px] text-green-600 bg-green-50 dark:bg-green-900/20 dark:text-green-400 px-1.5 py-0.5 rounded font-medium">
                    Asignado
                  </span>
                </div>
              )}
            </div>

            {/* ── Barcode preview ── */}
            {effectiveCodebar && (
              <div className="space-y-3">
                <div className="border-t border-gray-100 dark:border-gray-800" />

                <div>
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Vista previa
                  </span>
                </div>

                {/* Cards */}
                <div ref={printRef} className="no-print space-y-2 max-h-72 overflow-y-auto">
                  {cards.map((_, i) => (
                    <div
                      key={i}
                      className="flex flex-col items-center border border-dashed border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-white dark:bg-gray-900"
                    >
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1 truncate w-full text-center">
                        {description}
                      </span>
                      <svg
                        ref={(el) => { barcodeRefs.current[i] = el; }}
                        className="w-full max-w-[200px]"
                      />
                      <span className="text-base font-bold text-gray-900 dark:text-gray-100 mt-1">
                        {formatPrice(salePrice, unit)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Copies + Print */}
                <div className="flex items-center justify-between no-print pt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Copias</span>
                    <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-md">
                      <button
                        type="button"
                        onClick={() => setCopies((c) => Math.max(1, c - 1))}
                        className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      >
                        −
                      </button>
                      <span className="w-7 text-center text-xs font-medium tabular-nums text-gray-900 dark:text-gray-100">
                        {copies}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCopies((c) => Math.min(99, c + 1))}
                        className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="gap-1.5 h-8 text-xs"
                    onClick={(e) => { e.stopPropagation(); handlePrint(); }}
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Imprimir
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Scanner Overlay ── */}
      {scannerOpen && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex flex-col items-center justify-center p-4">
          <button
            type="button"
            className="absolute top-4 right-4 text-white/60 hover:text-white rounded-full h-10 w-10 flex items-center justify-center hover:bg-white/10 transition-colors"
            onClick={() => setScannerOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
          <div className="w-full max-w-sm">
            <div className="text-center mb-6">
              <h3 className="text-white text-lg font-semibold">Escanear código</h3>
              <p className="text-gray-400 text-sm mt-0.5">Apuntá la cámara al código de barras</p>
            </div>
            <div className="aspect-square bg-black rounded-2xl overflow-hidden relative border border-white/10 shadow-2xl">
              <Scanner
                formats={["code_128", "codabar", "qr_code", "ean_13", "ean_8"]}
                onScan={(result) => {
                  if (result?.[0]?.rawValue) {
                    setBarcodeInput(result[0].rawValue);
                    setScannerOpen(false);
                    toast.success(`Código escaneado: ${result[0].rawValue}`);
                  }
                }}
              />
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-56 h-32 border-2 border-green-400/60 rounded-lg" />
              </div>
            </div>
            <div className="mt-6 flex justify-center">
              <Button
                variant="outline"
                onClick={() => setScannerOpen(false)}
                className="bg-transparent text-white border-white/20 hover:bg-white/10"
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
