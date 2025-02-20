"use client";

import { useEffect, useRef, useState } from "react";
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
import { useReactToPrint } from "react-to-print";
import CodeBarButton from "./codebarButton";

interface props {
  value: string;
}
const CodeBarModal = ({ value }: props) => {
  const barcodeRef = useRef(null);
  const [generate, setGenerate] = useState(false);
  const [print, setPrint] = useState(false);

  const printRef = useRef(null);
  const handlePrint = useReactToPrint({
    content: () => printRef.current,
  });
  useEffect(() => {
    if (print === true) {
      handlePrint();
    }
  }, [print]);
  useEffect(() => {
    if (barcodeRef.current) {
      JsBarcode(barcodeRef.current, value, {
        format: "CODE128", // Puedes cambiar el formato si necesitas otro tipo de código de barras
        lineColor: "#000000",
        width: 3,
        height: 110,
        displayValue: true,
        fontSize: 80,
      });
    }
  }, [generate]);

  return (
    <Dialog>
      <DialogTrigger
        asChild
        className="h-10 bg-transparent font-semibold hover:text-white"
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
              setPrint(!print);
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
