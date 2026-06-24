"use client";

import { useState, useCallback } from "react";
import { Printer, FileText, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  printThermalReceipt,
  exportToPDF,
  buildPDFHTML,
  PDF_STYLES,
  type ThermalReceiptData,
} from "@/lib/print";
import { getOrderForPrint, type OrderPrintData } from "@/actions/orders";

interface Props {
  orderId: string;
  billingInfo: Record<string, unknown> | null;
}

export default function PrintRowButton({ orderId, billingInfo }: Props) {
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const buildPrintData = useCallback(
    (order: OrderPrintData, businessName: string): ThermalReceiptData => {
      const subtotal = order.items.reduce((sum, i) => sum + i.subTotal, 0);
      const billType = order.status === "pendiente" ? "Presupuesto" : "Comprobante";

      return {
        businessName,
        businessInfo: billingInfo
          ? {
              razonSocial: billingInfo.razonSocial as string,
              cuit: billingInfo.cuit as string,
              condicionIva: billingInfo.condicionIva as string,
              address: billingInfo.address as string,
            }
          : undefined,
        date: new Date(order.date),
        documentType: "DNI",
        billType,
        seller: order.seller || "",
        paidMethod: order.paymentMethod || "Efectivo",
        client: order.client?.name || undefined,
        clientIvaCondition: order.clientIvaCondition || undefined,
        clientDocumentNumber: order.clientDocumentNumber || undefined,
        products: order.items.map((i) => ({
          description: i.description || "Producto",
          amount: i.quantity,
          unitPrice: i.price,
          subtotal: i.subTotal,
        })),
        subtotal,
        discount:
          order.discountPercentage > 0 ? order.discountPercentage : undefined,
        discountAmount:
          order.discountAmount > 0 ? order.discountAmount : undefined,
        total: order.total,
      };
    },
    [billingInfo]
  );

  const handlePrint = async (mode: "thermal" | "pdf") => {
    setLoading(true);
    try {
      const result = await getOrderForPrint(orderId);
      if (result.error || !result.data) {
        console.error("Print error:", result.error);
        return;
      }

      const businessName = (billingInfo?.razonSocial as string) || "Mi Comercio";
      const receiptData = buildPrintData(result.data, businessName);

      if (mode === "thermal") {
        await printThermalReceipt(receiptData);
      } else {
        const targetWin = window.open("", "_blank");
        if (targetWin) {
          targetWin.document.write(
            "<html><head><title>Generando PDF...</title></head><body style='font-family:sans-serif; text-align:center; padding-top: 50px;'><h2>Generando comprobante, por favor espere...</h2></body></html>"
          );
        }

        const content = document.createElement("div");
        content.innerHTML = buildPDFHTML(receiptData, {});
        const styleEl = document.createElement("style");
        styleEl.textContent = PDF_STYLES;
        content.insertBefore(styleEl, content.firstChild);

        document.body.appendChild(content);
        try {
          const filename =
            result.data.status === "pendiente"
              ? `Presupuesto_${orderId.slice(-8)}`
              : `Comprobante_${orderId.slice(-8)}`;
          await exportToPDF(content as HTMLElement, {
            documentTitle: filename,
            format: "a4",
            filename,
            targetWindow: targetWin,
          });
        } catch (err) {
          if (targetWin) targetWin.close();
          console.error("PDF Export error:", err);
        } finally {
          document.body.removeChild(content);
        }
      }
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title="Imprimir"
          disabled={loading}
          onClick={(e) => e.stopPropagation()}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Printer className="h-4 w-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={() => handlePrint("thermal")}>
          <Printer className="mr-2 h-4 w-4" />
          Impresión Térmica
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handlePrint("pdf")}>
          <FileText className="mr-2 h-4 w-4" />
          Generar PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
