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

const CodeBarModal = ({ code, codebar, description, salePrice, unit }: Props) => {
  const barcodeValue = codebar || code;
  const barcodeRefs = useRef<(SVGSVGElement | null)[]>([]);
  const printRef = useRef<HTMLDivElement>(null);
  const [copies, setCopies] = useState(1);
  const [showPrice, setShowPrice] = useState(true);
  const [key, setKey] = useState(0);

  const unitSuffix = getUnitSuffix(unit);
  const hasBarcode = !!barcodeValue;
  const formattedPrice = formatPrice(salePrice, unitSuffix);

  const generateBarcodes = useCallback(() => {
    barcodeRefs.current.forEach((barcodeEl) => {
      if (barcodeEl) {
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
    generateBarcodes();
  }, [key, barcodeValue, generateBarcodes]);

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
          @page { size: 80mm 75mm; margin: 0; }
          @media print {
            body { -webkit-print-color-adjust: exact; margin: 0; padding: 0; }
            .no-print { display: none !important; }
            .label-container {
              width: 78mm !important;
              height: 75mm !important;
              overflow: hidden;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              padding: 2mm;
              box-sizing: border-box;
              page-break-after: always;
            }
            .label-description {
              font-size: 32px;
              font-weight: 700;
              text-align: center;
              line-height: 1.1;
              margin-bottom: 4px;
              word-wrap: break-word;
              width: 100%;
            }
            .label-price {
              font-size: 40px;
              font-weight: 800;
              text-align: center;
              margin-bottom: 8px;
            }
            .label-price--no-barcode {
              font-size: 56px;
              margin: 12px 0;
            }
            .label-barcode {
              text-align: center;
              margin: 4px 0px;
            }
          }
        `,
        format: "thermal",
      });
    }
  };

  const cards = Array.from({ length: copies }, (_, i) => i);

  return (
    <Dialog>
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
      <DialogContent className="w-full max-w-2xl">
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

        <div className="no-print border rounded-md p-4 bg-slate-50 max-h-96 overflow-y-auto">
          <div
            ref={printRef}
            className="mx-auto flex flex-wrap gap-6 justify-center"
            style={{
              width: "100%",
            }}
          >
              {cards.map((_, index) => (
              <div
                key={index}
                className="flex flex-col text-black items-center border border-dashed border-gray-300 rounded p-2 bg-white label-container"
                style={{ width: "78mm", height: "75mm", overflow: "hidden" }}
              >
                <div className="label-description outline-none focus:bg-blue-50 dark:focus:bg-gray-800 rounded px-1 transition-colors text-center font-semibold mb-1 truncate w-full"
                  contentEditable
                  suppressContentEditableWarning
                  spellCheck={false}
                  title="Haz clic para editar la descripción antes de imprimir"
                >
                  {description}
                </div>
                {showPrice && (
                  <div className={`label-price text-center font-bold mt-1${!hasBarcode ? ' label-price--no-barcode' : ''}`}>
                    {formattedPrice}
                  </div>
                )}
                {hasBarcode && (
                  <svg
                    ref={(el) => { barcodeRefs.current[index] = el; }}
                    className="w-full label-barcode"
                  />
                )}
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
