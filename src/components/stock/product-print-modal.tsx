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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { printElement } from "@/lib/print";
import { ProductExtended } from "./product-form";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: ProductExtended[];
  format?: "a4" | "thermal";
}

function formatPrice(price: number): string {
  const rounded = Math.round(price / 10) * 10;
  return `$${rounded}`;
}

const TAG_WIDTH = "6.3cm";
const TAG_HEIGHT_WITH_BARCODE = "3.2cm";
const TAG_HEIGHT_WITHOUT_BARCODE = "2.8cm";

const ProductPrintModal = ({ open, onOpenChange, products, format = "a4" }: Props) => {
  const [paperSize, setPaperSize] = useState<"a4" | "thermal">(format);
  const isThermal = paperSize === "thermal";
  const barcodeRefs = useRef<(SVGSVGElement | null)[]>([]);
  const printRef = useRef<HTMLDivElement>(null);
  const [copies, setCopies] = useState(1);
  const [showPrice, setShowPrice] = useState(true);
  const [showBarcode, setShowBarcode] = useState(false);
  const [key, setKey] = useState(0);

  const tagsPerPage = 24;

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
        const barcodeValue = product.codebar || product.code;
        if (barcodeEl && barcodeValue) {
          const barcodeWidth = isThermal ? (showPrice ? 1.8 : 2.5) : (showPrice ? 3 : 1.5);
          const barcodeHeight = isThermal ? 48 : 40;
          JsBarcode(barcodeEl, barcodeValue, {
            format: "CODE128",
            lineColor: "#000000",
            width: barcodeWidth,
            height: barcodeHeight,
            displayValue: true,
            fontSize: 10,
            margin: 0,
          });
        }
        index++;
      }
    });
  }, [products, copies, isThermal, showPrice]);

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
          @page { size: 55mm 65mm; margin: 0; }
          @media print {
            body { -webkit-print-color-adjust: exact; margin: 0; padding: 0; }
            .no-print { display: none !important; }
            .label-description {
              font-size: 14px;
              font-weight: 700;
              text-align: center;
              line-height: 1.3;
              margin-bottom: 4px;
              word-wrap: break-word;
              width: 100%;
            }
            .label-price {
              font-size: 14px;
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
            .no-barcode:not(.has-price) .label-description {
              font-size: 20px;
              font-weight: 900;
            }
            .no-barcode.has-price .label-description {
              font-size: 12px;
              font-weight: 600;
            }
            .no-barcode.has-price .label-price {
              font-size: 36px;
              font-weight: 900;
            }
          }
        ` : `
          @page { size: A4; margin: 5mm; }
          @media print {
            body { -webkit-print-color-adjust: exact; margin: 0; padding: 0; }
            .no-print { display: none !important; }
            .label-container {
              overflow: visible !important;
              min-height: 3.2cm;
            }
            .label-description {
              font-size: 14px;
              font-weight: 700;
              text-align: center;
              line-height: 1.3;
              margin-bottom: 4px;
              word-wrap: break-word;
              width: 100%;
            }
            .label-price {
              font-size: 14px;
              font-weight: 700;
              text-align: center;
              margin-bottom: 2px;
            }
            .label-barcode {
              text-align: center;
              margin: 4px 0px;
            }
            .label-container.has-barcode .label-barcode {
              margin: 4px -6px;
            }
            .label-code {
              font-size: 10px;
              text-align: center;
              margin-top: 2px;
            }
            .no-barcode:not(.has-price) .label-description {
              font-size: 20px;
              font-weight: 900;
            }
            .no-barcode.has-price .label-description {
              font-size: 12px;
              font-weight: 600;
            }
            .no-barcode.has-price .label-price {
              font-size: 20px;
              font-weight: 700;
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
          <div className="flex flex-col gap-2">
            <Label htmlFor="paper-size">Tamaño de papel</Label>
            <Select value={paperSize} onValueChange={(v: "a4" | "thermal") => setPaperSize(v)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="a4">Hoja A4</SelectItem>
                <SelectItem value="thermal">Etiqueta (55×65mm)</SelectItem>
              </SelectContent>
            </Select>
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
            onClick={() => {
              setShowBarcode((prev) => !prev);
              setKey((k) => k + 1);
            }}
            className="mt-5"
          >
            {showBarcode ? "Quitar" : "Generar"}
          </Button>
        </div>

        <div className="no-print border rounded-md p-4 bg-slate-50 max-h-96 overflow-y-auto">
          <div ref={printRef}>
            {isThermal ? (
              <>
                {allTags.map((tag, globalIndex) => {
                  const hasBarcode = showBarcode && Boolean(tag.product.codebar || tag.product.code);
                  const formattedPrice = formatPrice(tag.product.salePrice);
                  return (
                    <div
                      key={tag.key}
                      className={`flex flex-col text-black items-center border border-dashed border-gray-300 rounded p-2 bg-white ${!hasBarcode ? "no-barcode" : ""} ${showPrice ? "has-price" : ""}`}
                      style={{
                        width: TAG_WIDTH,
                        height: hasBarcode && showPrice ? undefined : TAG_HEIGHT_WITHOUT_BARCODE,
                        ...(globalIndex < allTags.length - 1 ? { pageBreakAfter: "always" } : {}),
                      }}
                    >
                      <div className="label-description">
                        {tag.product.description}
                      </div>
                      {showPrice && (
                        <div
                          className="label-price outline-none focus:bg-blue-50 dark:focus:bg-gray-800 rounded px-1 transition-colors"
                          contentEditable
                          suppressContentEditableWarning
                          spellCheck={false}
                          title="Haz clic para editar el precio antes de imprimir"
                        >
                          {formattedPrice}
                        </div>
                      )}
                      <div className="label-code">
                        {tag.product.code}
                      </div>
                      {hasBarcode && (
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
                      )}
                    </div>
                  );
                })}
              </>
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
                      const hasBarcode = showBarcode && Boolean(tag.product.codebar || tag.product.code);
                      const formattedPrice = formatPrice(tag.product.salePrice);

                      return (
                        <div
                          key={tag.key}
                          className={`flex flex-col text-black items-center border border-dashed border-gray-300 rounded p-2 bg-white label-container ${!hasBarcode ? "no-barcode" : "has-barcode"} ${showPrice ? "has-price" : ""}`}
                          style={{ width: TAG_WIDTH, minHeight: hasBarcode && showPrice ? TAG_HEIGHT_WITHOUT_BARCODE : hasBarcode ? TAG_HEIGHT_WITH_BARCODE : TAG_HEIGHT_WITHOUT_BARCODE }}
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
                            <div
                              className="label-price outline-none focus:bg-blue-50 dark:focus:bg-gray-800 rounded px-1 transition-colors"
                              contentEditable
                              suppressContentEditableWarning
                              spellCheck={false}
                              title="Haz clic para editar el precio antes de imprimir"
                            >
                              {formattedPrice}
                            </div>
                          )}
                          <div className="label-code">
                            {tag.product.code}
                          </div>
                          {hasBarcode && (
                            <div className="label-barcode">
                              <svg
                                ref={(el) => {
                                  barcodeRefs.current[globalIndex] = el;
                                }}
                                className="w-full"
                              />
                            </div>
                          )}
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
