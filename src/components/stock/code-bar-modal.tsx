"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { printElement } from "@/lib/print";
import CodeBarButton from "./codebarButton";

interface Props {
  code: string;
  codebar?: string;
  description: string;
  salePrice: number;
  unit?: string;
}

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

const TAG_WIDTH = "6.3cm";
const TAG_HEIGHT_WITH_BARCODE = "5cm";
const TAG_HEIGHT_WITHOUT_BARCODE = "3.5cm";

const CodeBarModal = ({ code, codebar, description, salePrice, unit }: Props) => {
  const hasCodebar = Boolean(codebar);
  const barcodeRefs = useRef<(SVGSVGElement | null)[]>([]);
  const printRef = useRef<HTMLDivElement>(null);
  const [copies, setCopies] = useState(1);
  const [showPrice, setShowPrice] = useState(true);
  const [key, setKey] = useState(0);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [barcodeSource, setBarcodeSource] = useState<"code" | "codebar">("code");

  const unitSuffix = getUnitSuffix(unit);
  const formattedPrice = formatPrice(salePrice, unitSuffix);
  const tagHeight = hasCodebar ? TAG_HEIGHT_WITH_BARCODE : TAG_HEIGHT_WITHOUT_BARCODE;
  const barcodeValue = barcodeSource === "codebar" && codebar ? codebar : code;

  const generateBarcodes = useCallback(() => {
    barcodeRefs.current.forEach((barcodeEl) => {
      if (barcodeEl) {
        JsBarcode(barcodeEl, barcodeValue, {
          format: "CODE128",
          lineColor: "#000000",
          width: 2,
          height: hasCodebar ? 60 : 40,
          displayValue: true,
          fontSize: 10,
          margin: 0,
        });
      }
    });
  }, [barcodeValue, hasCodebar]);

  useEffect(() => {
    if (isDialogOpen) {
      generateBarcodes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

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
        `,
        format: "thermal",
      });
    }
  };

  const cards = Array.from({ length: copies }, (_, i) => i);

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger
        asChild
        className="h-10 bg-transparent font-semibold hover:text-white dark:text-white"
      >
        <Button
          onClick={(e) => e.stopPropagation()}
          variant="outline"
          size="sm"
        >
          <CodeBarButton />
        </Button>
      </DialogTrigger>
      <DialogContent className="w-full max-w-md">
        <DialogHeader>
          <DialogTitle>Codigo de Barras</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-4 py-4">
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
          <div className="flex items-center gap-2 mt-5">
            <Checkbox
              id="show-price"
              checked={showPrice}
              onCheckedChange={(checked) => setShowPrice(!!checked)}
            />
            <Label htmlFor="show-price" className="cursor-pointer">Mostrar precio</Label>
          </div>
          <Button
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              setKey((k) => k + 1);
            }}
            className="mt-5"
          >
            Generar
          </Button>
        </div>

        {hasCodebar && (
          <div className="flex items-center gap-2 py-2 border-t">
            <Label className="text-sm whitespace-nowrap">Generar desde:</Label>
            <Button
              type="button"
              variant={barcodeSource === "code" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setBarcodeSource("code");
                setKey((k) => k + 1);
              }}
            >
              Código interno: {code}
            </Button>
            <Button
              type="button"
              variant={barcodeSource === "codebar" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setBarcodeSource("codebar");
                setKey((k) => k + 1);
              }}
            >
              Código de barras: {codebar}
            </Button>
          </div>
        )}

        <div className="no-print border rounded-md p-4 bg-slate-50 max-h-96 overflow-y-auto">
          <div
            ref={printRef}
            className="mx-auto grid gap-3"
            style={{
              gridTemplateColumns: `repeat(auto-fill, minmax(${TAG_WIDTH}, 1fr))`,
              width: "100%",
            }}
          >
            {cards.map((_, index) => (
              <div
                key={index}
                className="flex flex-col text-black items-center border border-dashed border-gray-300 rounded p-2 bg-white"
                style={{ width: TAG_WIDTH, height: tagHeight }}
              >
                <div className="text-center font-semibold text-sm mb-1 truncate w-full">
                  {description}
                </div>
                {showPrice && (
                  <div className="text-center font-bold text-lg mt-1">
                    {formattedPrice}
                  </div>
                )}
                <div className="text-center text-xs mt-1">
                  {code}
                </div>
                <svg
                  ref={(el) => {
                    if (el) {
                      el.setAttribute("ref", "");
                      if (el.tagName !== "SVG") {
                        Object.defineProperty(el, "tagName", { get: () => "SVG" });
                      }
                      barcodeRefs.current[index] = el;
                    } else {
                      barcodeRefs.current[index] = null;
                    }
                  }}
                  className="w-full"
                />
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button
            type="submit"
            className="text-xl"
            onClick={(e) => {
              e.stopPropagation();
              handlePrint();
            }}
          >
            Imprimir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CodeBarModal;
