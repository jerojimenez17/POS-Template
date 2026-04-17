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
import { printElement } from "@/lib/print";
import CodeBarButton from "./codebarButton";

interface Props {
  code: string;
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

const CodeBarModal = ({ code, description, salePrice, unit }: Props) => {
  const barcodeRefs = useRef<(SVGSVGElement | null)[]>([]);
  const printRef = useRef<HTMLDivElement>(null);
  const [copies, setCopies] = useState(1);
  const [key, setKey] = useState(0);

  const unitSuffix = getUnitSuffix(unit);
  const formattedPrice = formatPrice(salePrice, unitSuffix);

  const generateBarcodes = useCallback(() => {
    barcodeRefs.current.forEach((barcodeEl) => {
      if (barcodeEl) {
        JsBarcode(barcodeEl, code, {
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
  }, [code]);

  useEffect(() => {
    generateBarcodes();
  }, [key, code, generateBarcodes]);

  const handleCopiesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value)) {
      setCopies(Math.max(1, Math.min(50, value)));
    }
  };

  const handlePrint = async () => {
    if (printRef.current) {
      await printElement(printRef.current, {
        documentTitle: `CodigoBarras_${code}`,
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
