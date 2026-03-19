"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import JsBarcode from "jsbarcode";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "../ui/button";
import { printElement } from "@/lib/print";
import CodeBarButton from "./codebarButton";

interface Props {
  value: string;
}

const CodeBarModal = ({ value }: Props) => {
  const barcodeRef = useRef<SVGSVGElement>(null);
  const [generate, setGenerate] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useCallback(async () => {
    if (printRef.current) {
      await printElement(printRef.current, {
        documentTitle: `CodigoBarras_${value}`,
        pageStyle: `
          @page { size: auto; margin: 10mm; }
          @media print {
            body { -webkit-print-color-adjust: exact; }
            .no-print { display: none !important; }
          }
        `,
        format: "thermal",
      });
    }
  }, [value]);

  useEffect(() => {
    if (barcodeRef.current) {
      JsBarcode(barcodeRef.current, value, {
        format: "CODE128",
        lineColor: "#000000",
        width: 3,
        height: 110,
        displayValue: true,
        fontSize: 80,
      });
    }
  }, [generate, value]);

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
      <DialogContent className="w-full ">
        <DialogHeader>
          <DialogTitle>Codigo de Barras</DialogTitle>
        </DialogHeader>
        <div ref={printRef} className="mx-auto gap-4 py-4 grid">
          <svg className="mx-auto w-full" ref={barcodeRef}></svg>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            className="text-xl"
            onClick={(e) => {
              e.stopPropagation();
              setGenerate(!generate);
            }}
          >
            Generar
          </Button>
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
