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
import { LABEL_45X55_PAGE_STYLE, LABEL_55X45_HEIGHT, LABEL_55X45_WIDTH } from "./product-print-modal";

interface Props {
  code: string;
  codebar?: string;
  description: string;
  salePrice: number;
  unit?: string;
}

function formatPrice(price: number): string {
  const rounded = Math.round(price / 10) * 10;
  return `$${rounded}`;
}

const TAG_WIDTH = LABEL_55X45_WIDTH;
const TAG_HEIGHT = LABEL_55X45_HEIGHT;

const CodeBarModal = ({ code, codebar, description, salePrice }: Props) => {
  const hasCodebar = Boolean(codebar?.trim());
  const barcodeRefs = useRef<(SVGSVGElement | null)[]>([]);
  const printRef = useRef<HTMLDivElement>(null);
  const [copies, setCopies] = useState(1);
  const [showPrice, setShowPrice] = useState(true);
  const [key, setKey] = useState(0);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [barcodeSource, setBarcodeSource] = useState<"code" | "codebar">("code");

  const formattedPrice = formatPrice(salePrice);
  const barcodeValue = barcodeSource === "codebar" && codebar?.trim() ? codebar.trim() : code;

  const generateBarcodes = useCallback(() => {
    barcodeRefs.current.forEach((barcodeEl) => {
      if (barcodeEl) {
        JsBarcode(barcodeEl, barcodeValue, {
          format: "CODE128",
          lineColor: "#000000",
          width: 2,
          height: 42,
          displayValue: true,
          fontSize: 10,
          margin: 0,
        });
      }
    });
  }, [barcodeValue]);

  useEffect(() => {
    if (isDialogOpen) {
      generateBarcodes();
    }
  }, [generateBarcodes, isDialogOpen, key, copies, showPrice]);

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
        pageStyle: LABEL_45X55_PAGE_STYLE,
        format: "thermal",
        orientation: "landscape",
        // The PDF fallback preserves the content, but final physical size still depends on print scale.
        fallbackToPDF: true,
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
            className="mx-auto flex flex-col"
            style={{
              width: "100%",
              gap: "2mm",
            }}
          >
            {cards.map((_, index) => (
              <div
                key={index}
                className="label-container flex flex-col text-black items-center border border-dashed border-gray-300 rounded p-2 bg-white"
                style={{
                  width: TAG_WIDTH,
                  height: TAG_HEIGHT,
                  boxSizing: "border-box",
                  padding: "2mm",
                  gap: "1mm",
                }}
              >
                <div className="label-description min-w-0 max-w-full overflow-hidden text-center font-semibold text-sm mb-1 w-full break-words">
                  {description}
                </div>
                {showPrice && (
                  <div className="label-price text-center font-bold text-xl mt-1">
                    {formattedPrice}
                  </div>
                )}
                <div className="label-code text-center text-xs mt-1">
                  {code}
                </div>
                <svg
                  ref={(el) => {
                    barcodeRefs.current[index] = el;
                  }}
                  className="label-barcode min-w-0 max-w-full w-full overflow-hidden"
                />
              </div>
            ))}
          </div>
        </div>

        <p className="no-print text-sm text-muted-foreground">
          En la impresión seleccioná escala 100%, márgenes ninguno y orientación horizontal (landscape). Las preferencias del navegador o driver pueden prevalecer.
        </p>

        <DialogFooter>
          <Button
            type="submit"
            className="text-xl"
            onClick={(e) => {
              e.stopPropagation();
              handlePrint();
            }}
          >
            Imprimir!
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CodeBarModal;
