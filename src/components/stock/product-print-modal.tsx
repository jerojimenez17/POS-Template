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
import { Checkbox } from "@/components/ui/checkbox";
import { printElement } from "@/lib/print";
import { ProductExtended } from "./product-form";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: ProductExtended[];
  format?: "a4" | "thermal";
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

const ProductPrintModal = ({ open, onOpenChange, products, format = "a4" }: Props) => {
  const isThermal = format === "thermal";
  const barcodeRefs = useRef<(SVGSVGElement | null)[]>([]);
  const printRef = useRef<HTMLDivElement>(null);
  const [copies, setCopies] = useState(1);
  const [showPrice, setShowPrice] = useState(true);
  const [key, setKey] = useState(0);

  const hasAnyCodebar = products.some((p) => Boolean(p.codebar));
  const tagHeight = isThermal
    ? undefined
    : hasAnyCodebar
      ? TAG_HEIGHT_WITH_BARCODE
      : TAG_HEIGHT_WITHOUT_BARCODE;
  const tagsPerPage = hasAnyCodebar ? 15 : 24;

  const allTags: Array<{ product: ProductExtended; copyIndex: number; key: string }> = [];
  products.forEach((product) => {
    for (let i = 0; i < copies; i++) {
      allTags.push({ product, copyIndex: i, key: `${product.id}-${i}` });
    }
  });

  const pages: Array<Array<{ product: ProductExtended; copyIndex: number; key: string }>> = [];
  for (let i = 0; i < allTags.length; i += tagsPerPage) {
    pages.push(allTags.slice(i, i + tagsPerPage));
  }

  const generateBarcodes = useCallback(() => {
    let index = 0;
    products.forEach((product) => {
      for (let c = 0; c < copies; c++) {
        const barcodeEl = barcodeRefs.current[index];
        if (barcodeEl && product.codebar) {
          JsBarcode(barcodeEl, product.codebar, {
            format: "CODE128",
            lineColor: "#000000",
            width: 1.5,
            height: hasAnyCodebar ? 40 : 30,
            displayValue: true,
            fontSize: 10,
            margin: 0,
          });
        }
        index++;
      }
    });
  }, [products, copies, hasAnyCodebar]);

  useEffect(() => {
    generateBarcodes();
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
      const pageStyle = isThermal ? `
          @page { size: 60mm auto; margin: 0; }
          @media print {
            body { -webkit-print-color-adjust: exact; margin: 0; padding: 0; }
            .no-print { display: none !important; }
            .label-description {
              font-size: 16px;
              font-weight: 800;
              text-align: center;
              line-height: 1.3;
              margin-bottom: 4px;
              word-wrap: break-word;
              width: 100%;
            }
            .label-price {
              font-size: 13px;
              font-weight: 700;
              text-align: center;
              margin-bottom: 2px;
            }
            .label-barcode {
              text-align: center;
              margin: 4px 0px;
            }
            .label-code {
              font-size: 10px;
              text-align: center;
              margin-top: 2px;
            }
          }
        ` : `
          @page { size: A4; margin: 5mm; }
          @media print {
            body { -webkit-print-color-adjust: exact; margin: 0; padding: 0; }
            .no-print { display: none !important; }
            .label-container {
              overflow: visible !important;
            }
            .label-description {
              font-size: 16px;
              font-weight: 800;
              text-align: center;
              line-height: 1.3;
              margin-bottom: 4px;
              word-wrap: break-word;
              width: 100%;
            }
            .label-price {
              font-size: 13px;
              font-weight: 700;
              text-align: center;
              margin-bottom: 2px;
            }
            .label-barcode {
              text-align: center;
              margin: 4px 0px;
            }
            .label-code {
              font-size: 10px;
              text-align: center;
              margin-top: 2px;
            }
          }
        `;
      await printElement(printRef.current, {
        documentTitle: `Etiquetas_${new Date().toISOString().split("T")[0]}`,
        pageStyle,
        format: isThermal ? "thermal" : "a4",
      });
    }
  };

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
            onClick={() => setKey((k) => k + 1)}
            className="mt-5"
          >
            Generar
          </Button>
        </div>

        <div className="no-print border rounded-md p-4 bg-slate-50 max-h-96 overflow-y-auto">
          <div ref={printRef}>
            {isThermal ? (
              <div className="flex flex-col items-center gap-3">
                {allTags.map((tag, globalIndex) => {
                  const unitSuffix = getUnitSuffix(tag.product.unit ?? undefined);
                  const formattedPrice = formatPrice(tag.product.salePrice, unitSuffix);
                  return (
                    <div
                      key={tag.key}
                      className="flex flex-col text-black items-center border border-dashed border-gray-300 rounded p-2 bg-white"
                      style={{ width: TAG_WIDTH }}
                    >
                      <div className="label-description">
                        {tag.product.description}
                      </div>
                      {showPrice && (
                        <div className="label-price">
                          {formattedPrice}
                        </div>
                      )}
                      <div className="label-code">
                        {tag.product.code}
                      </div>
                      <svg
                        ref={(el) => {
                          if (el) {
                            barcodeRefs.current[globalIndex] = el;
                          } else {
                            barcodeRefs.current[globalIndex] = null;
                          }
                        }}
                        className="w-full"
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              pages.map((page, pageIndex) => (
                <div
                  key={pageIndex}
                  style={pageIndex < pages.length - 1 ? { pageBreakAfter: "always" } : undefined}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: `repeat(3, ${TAG_WIDTH})`,
                      gap: "2mm",
                      justifyContent: "center",
                    }}
                  >
                    {page.map((tag, tagIndex) => {
                      const globalIndex = pageIndex * tagsPerPage + tagIndex;
                      const unitSuffix = getUnitSuffix(tag.product.unit ?? undefined);
                      const formattedPrice = formatPrice(tag.product.salePrice, unitSuffix);

                      return (
                        <div
                          key={tag.key}
                          className="flex flex-col text-black items-center justify-center border border-dashed border-gray-300 rounded p-2 bg-white label-container"
                          style={{ width: TAG_WIDTH, height: tagHeight, overflow: "hidden" }}
                        >
                          <div
                            className="label-description outline-none focus:bg-blue-50 dark:focus:bg-gray-800 rounded px-1 transition-colors"
                            contentEditable
                            suppressContentEditableWarning
                            spellCheck={false}
                            title="Haz clic para editar la descripción antes de imprimir"
                          >
                            {tag.product.description}
                          </div>
                          {showPrice && (
                            <div className="label-price">
                              {formattedPrice}
                            </div>
                          )}
                          <div className="label-code">
                            {tag.product.code}
                          </div>
                          {tag.product.codebar ? (
                            <div className="label-barcode">
                              <svg
                                ref={(el) => {
                                  barcodeRefs.current[globalIndex] = el;
                                }}
                                className="w-full"
                              />
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
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
