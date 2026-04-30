"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { printElement } from "@/lib/print";
import { ProductExtended } from "./product-form";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: ProductExtended[];
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

const ProductPrintModal = ({ open, onOpenChange, products }: Props) => {
  const barcodeRefs = useRef<(SVGSVGElement | null)[]>([]);
  const printRef = useRef<HTMLDivElement>(null);
  const [copies, setCopies] = useState(1);
  const [key, setKey] = useState(0);

  const generateBarcodes = useCallback(() => {
    products.forEach((product, index) => {
      const barcodeEl = barcodeRefs.current[index];
      const code = product.code;
      if (barcodeEl && code) {
        JsBarcode(barcodeEl, code, {
          format: "CODE128",
          lineColor: "#000000",
          width: 1.5,
          height: 40,
          displayValue: true,
          fontSize: 10,
          margin: 0,
        });
      }
    });
  }, [products]);

  useEffect(() => {
    if (open) {
      generateBarcodes();
    }
  }, [key, open, products, generateBarcodes]);

  const handleCopiesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value)) {
      setCopies(Math.max(1, Math.min(50, value)));
    }
  };

  const handlePrint = async () => {
    if (printRef.current) {
      await printElement(printRef.current, {
        documentTitle: `Etiquetas_${new Date().toISOString().split("T")[0]}`,
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
            .label-barcode {
              text-align: center;
              margin: 4px 0px;
            }
            .label-code {
              font-size: 12px;
              text-align: center;
              margin-top: 2px;
            }
          }
        `,
        format: "thermal",
      });
    }
  };

  const cards = Array.from({ length: copies }, (_, i) => i);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-2xl">
        <DialogHeader>
          <DialogTitle>Imprimir Etiquetas</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-4 py-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="copies">Copias por producto</Label>
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
            onClick={() => setKey((k) => k + 1)}
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
            {products.map((product, productIndex) =>
              cards.map((_, copyIndex) => {
                const elementIndex = productIndex * copies + copyIndex;
                const unitSuffix = getUnitSuffix(product.unit ?? undefined);
                const formattedPrice = formatPrice(product.salePrice, unitSuffix);
                
                return (
                  <div
                    key={`${product.id}-${copyIndex}`}
                    className="flex flex-col text-black items-center justify-center border border-dashed border-gray-300 rounded p-2 bg-white label-container"
                    style={{ width: "78mm", height: "75mm", overflow: "hidden" }}
                  >
                    <div className="label-description">
                      {product.description}
                    </div>
                    <div className="label-price">
                      {formattedPrice}
                    </div>
                    {product.code && (
                      <div className="label-barcode">
                        <svg
                          ref={(el) => {
                            barcodeRefs.current[elementIndex] = el;
                          }}
                          className="w-full"
                        />
                      </div>
                    )}
                    <div className="label-code">
                      {product.code}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            type="submit"
            className="text-xl"
            onClick={handlePrint}
          >
            Imprimir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ProductPrintModal;
