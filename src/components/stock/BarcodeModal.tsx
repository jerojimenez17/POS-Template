"use client";

import { useEffect, useRef, useState, useTransition, startTransition, useCallback } from "react";
import dynamic from "next/dynamic";
import JsBarcode from "jsbarcode";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

const TAG_WIDTH = "6.3cm";
const TAG_HEIGHT_WITH_BARCODE = "5cm";
const TAG_HEIGHT_WITHOUT_BARCODE = "3.5cm";

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
  const [showPrice, setShowPrice] = useState(true);
  const [barcodeSource, setBarcodeSource] = useState<"code" | "codebar">("code");
  const [paperSize, setPaperSize] = useState<"a4" | "thermal">("thermal");

  const barcodeRefs = useRef<(SVGSVGElement | null)[]>([]);
  const printRef = useRef<HTMLDivElement>(null);

  const effectiveCodebar = savedCodebar || initialCodebar || null;
  const hasCodebar = Boolean(effectiveCodebar);
  const tagHeight = hasCodebar ? TAG_HEIGHT_WITH_BARCODE : TAG_HEIGHT_WITHOUT_BARCODE;
  const barcodeValue =
    barcodeSource === "codebar" && effectiveCodebar ? effectiveCodebar : code;
  const isThermal = paperSize === "thermal";

  const renderBarcode = useCallback((el: SVGSVGElement | null, value: string) => {
    if (!el || !value) return;
    try {
      JsBarcode(el, value, {
        format: "CODE128",
        lineColor: "#000000",
        width: 2,
        height: hasCodebar ? 60 : 40,
        displayValue: true,
        fontSize: 10,
        margin: 0,
      });
    } catch {
      // silently ignore if SVG ref is stale
    }
  }, [hasCodebar]);

  useEffect(() => {
    if (!open || !code) return;
    barcodeRefs.current.forEach((el) => renderBarcode(el, barcodeValue));
  }, [barcodeValue, copies, open, code, renderBarcode]);

  const handleSave = () => {
    if (!barcodeInput.trim()) return;
    startTransition(async () => {
      try {
        const result = await updateProduct(productId, { codebar: barcodeInput.trim() });
        if (result.error) {
          toast.error(result.error);
        } else {
          toast.success("Código de barras guardado");
          setSavedCodebar(barcodeInput.trim());
          setIsEditing(false);
          onSuccess?.(barcodeInput.trim());
        }
      } catch (error) {
        console.error("Error saving barcode:", error);
        toast.error("Error al guardar el código de barras");
      }
    });
  };

  const handlePrint = async () => {
    if (printRef.current) {
      const pageStyle = isThermal
        ? `
          @page { size: 60mm auto; margin: 0; }
          @media print {
            body { -webkit-print-color-adjust: exact; margin: 0; padding: 0; }
            .no-print { display: none !important; }
            .label-container {
              width: 6.3cm !important;
              overflow: hidden;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              padding: 2mm;
              box-sizing: border-box;
              page-break-inside: avoid;
            }
            .label-description {
              font-size: 12px;
              font-weight: 700;
              text-align: center;
              line-height: 1.1;
              margin-bottom: 2px;
              word-wrap: break-word;
              width: 100%;
            }
            .label-price {
              font-size: 16px;
              font-weight: 800;
              text-align: center;
              margin-bottom: 2px;
            }
            .label-code {
              font-size: 10px;
              text-align: center;
              margin-top: 1px;
            }
            .label-barcode {
              text-align: center;
              margin: 2px 0px;
            }
          }
        `
        : `
          @page { size: A4; margin: 5mm; }
          @media print {
            body { -webkit-print-color-adjust: exact; margin: 0; padding: 0; }
            .no-print { display: none !important; }
            .print-grid {
              display: grid !important;
              grid-template-columns: repeat(3, ${TAG_WIDTH}) !important;
              gap: 2mm !important;
              justify-content: center !important;
            }
            .label-container {
              width: ${TAG_WIDTH} !important;
              height: ${tagHeight} !important;
              overflow: hidden;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              padding: 2mm;
              box-sizing: border-box;
              border: 1px dashed #ccc !important;
              border-radius: 4px;
              page-break-inside: avoid;
            }
            .label-description {
              font-size: 12px;
              font-weight: 700;
              text-align: center;
              line-height: 1.1;
              margin-bottom: 2px;
              word-wrap: break-word;
              width: 100%;
            }
            .label-price {
              font-size: 16px;
              font-weight: 800;
              text-align: center;
              margin-bottom: 2px;
            }
            .label-code {
              font-size: 10px;
              text-align: center;
              margin-top: 1px;
            }
            .label-barcode {
              text-align: center;
              margin: 2px 0px;
            }
          }
        `;

      await printElement(printRef.current, {
        documentTitle: `CodigoBarras_${barcodeValue}`,
        pageStyle,
        format: paperSize,
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
            setBarcodeSource("code");
            setPaperSize("thermal");
          });
        }
      }}>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => e.stopPropagation()}
            title="Código de barras"
            className="h-8 w-8 text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
          >
            <Barcode className={`h-4 w-4`} />
          </Button>
        </DialogTrigger>

        <DialogContent
          className="max-w-md p-0 gap-0 overflow-visible"
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
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate font-medium">
                {description}
              </p>
            </div>
          </div>

          <div className="border-t border-gray-100 dark:border-gray-800" />

          <div className="px-5 py-4 space-y-4">
            {/* ── Codebar section ── */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  Código de barras
                </span>
                {effectiveCodebar && !isEditing && (
                  <button
                    type="button"
                    onClick={() => { setBarcodeInput(effectiveCodebar); setIsEditing(true); }}
                    className="text-xs text-blue-500 hover:text-blue-600 flex items-center gap-1 transition-colors font-medium"
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
                      className="h-9 text-sm pr-9 bg-gray-50/50 dark:bg-gray-800/30 border-gray-250 dark:border-gray-700"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSave();
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setScannerOpen(true)}
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-md hover:bg-gray-150 dark:hover:bg-gray-800/80 transition-colors"
                      title="Escanear"
                      disabled={isPending}
                    >
                      <ScanBarcode className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <Button
                    size="sm"
                    className="h-9 gap-1.5 text-xs shrink-0 bg-black hover:bg-gray-800 dark:bg-white dark:hover:bg-gray-200 dark:text-gray-950 text-white font-semibold"
                    onClick={handleSave}
                    disabled={isPending || !barcodeInput.trim()}
                  >
                    <Check className="h-3.5 w-3.5" />
                    {isPending ? "Guardando..." : "Guardar"}
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800/30 rounded-xl border border-gray-100 dark:border-gray-800/50">
                  <span className="text-xs text-gray-600 dark:text-gray-400 font-mono flex-1 truncate">
                    {effectiveCodebar}
                  </span>
                  <span className="text-[10px] text-green-600 bg-green-50 dark:bg-green-950/40 dark:text-green-400 px-2 py-0.5 rounded-lg font-bold border border-green-100 dark:border-green-900/30">
                    Asignado
                  </span>
                </div>
              )}
            </div>

            {hasCodebar && (
              <div className="space-y-2">
                <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider block select-none">
                  Generar desde:
                </span>
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-gray-50 dark:bg-gray-800/30 rounded-xl border border-gray-100 dark:border-gray-800/50">
                  <button
                    type="button"
                    onClick={() => setBarcodeSource("code")}
                    className={`flex flex-col items-center justify-center py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                      barcodeSource === "code"
                        ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm border border-gray-200 dark:border-gray-600"
                        : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-transparent"
                    }`}
                  >
                    <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Código Interno</span>
                    <span className="font-mono mt-0.5 truncate max-w-full text-xs">{code}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setBarcodeSource("codebar")}
                    className={`flex flex-col items-center justify-center py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                      barcodeSource === "codebar"
                        ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm border border-gray-200 dark:border-gray-600"
                        : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-transparent"
                    }`}
                  >
                    <span className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Código Barras</span>
                    <span className="font-mono mt-0.5 truncate max-w-full text-xs">{effectiveCodebar}</span>
                  </button>
                </div>
              </div>
            )}

            {/* ── Print Configuration ── */}
            <div className="border-t border-gray-100 dark:border-gray-800 pt-3 space-y-3">
              <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider block select-none">
                Configuración de Impresión
              </span>
              
              <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 dark:bg-gray-800/30 rounded-xl border border-gray-100 dark:border-gray-800/50">
                {/* Paper Size */}
                <div className="space-y-1.5">
                  <Label htmlFor="paper-size" className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider block">
                    Tamaño de Papel
                  </Label>
                  <Select value={paperSize} onValueChange={(v: "a4" | "thermal") => setPaperSize(v)}>
                    <SelectTrigger id="paper-size" className="w-full h-8 text-xs bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="thermal" className="text-xs">Etiqueta (Térmica)</SelectItem>
                      <SelectItem value="a4" className="text-xs">Hoja A4 (Grilla)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Copies */}
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider block">
                    Copias
                  </Label>
                  <div className="flex items-center h-8 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md">
                    <button
                      type="button"
                      onClick={() => setCopies((c) => Math.max(1, c - 1))}
                      className="px-3 h-full text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      −
                    </button>
                    <span className="flex-1 text-center text-xs font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                      {copies}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCopies((c) => Math.min(99, c + 1))}
                      className="px-3 h-full text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Price Toggle */}
                <div className="col-span-2 flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-gray-800/40">
                  <Checkbox
                    id="show-price-modal"
                    checked={showPrice}
                    onCheckedChange={(checked) => setShowPrice(checked === true)}
                  />
                  <Label
                    htmlFor="show-price-modal"
                    className="text-xs text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 cursor-pointer select-none transition-colors"
                  >
                    Mostrar precio en etiqueta
                  </Label>
                </div>
              </div>
            </div>

            {/* ── Barcode Preview ── */}
            {code && (
              <div className="border-t border-gray-100 dark:border-gray-800 pt-3 space-y-2">
                <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider block select-none">
                  Vista Previa
                </span>
                
                <div className="no-print border border-gray-200 dark:border-gray-700/80 rounded-xl p-3 bg-slate-50 dark:bg-gray-900/40 max-h-56 overflow-y-auto">
                  <div
                    ref={printRef}
                    className="print-grid flex flex-col items-center gap-3 w-full"
                  >
                    {cards.map((_, i) => (
                      <div
                        key={i}
                        className="label-container flex flex-col text-black items-center border border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-2 bg-white dark:bg-gray-900"
                        style={{ width: TAG_WIDTH, minHeight: tagHeight }}
                      >
                        <span
                          contentEditable
                          suppressContentEditableWarning
                          spellCheck={false}
                          className="label-description text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1 w-full text-center outline-none focus:bg-blue-50 dark:focus:bg-gray-800 rounded px-1 transition-colors break-words whitespace-normal"
                          title="Haz clic para editar la descripción antes de imprimir"
                        >
                          {description}
                        </span>
                        {showPrice && (
                          <span className="label-price text-base font-bold text-gray-900 dark:text-gray-100">
                            {formatPrice(salePrice, unit)}
                          </span>
                        )}
                        <span className="label-code text-xs text-gray-600 dark:text-gray-400 mt-1">
                          {code}
                        </span>
                        <svg
                          ref={(el) => {
                            barcodeRefs.current[i] = el;
                            if (el) renderBarcode(el, barcodeValue);
                          }}
                          className="label-barcode w-full"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Action Footer ── */}
            <div className="flex justify-end gap-2 pt-3 border-t border-gray-100 dark:border-gray-800/60">
              <Button
                size="sm"
                className="gap-1.5 h-9 px-4 text-xs font-semibold bg-black hover:bg-gray-800 dark:bg-white dark:hover:bg-gray-200 dark:text-gray-950 text-white"
                onClick={(e) => { e.stopPropagation(); handlePrint(); }}
              >
                <Printer className="h-4 w-4" />
                Imprimir
              </Button>
            </div>
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
