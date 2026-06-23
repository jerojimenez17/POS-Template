"use client";

import { Printer, FileText } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { printThermalReceipt, exportToPDF, buildPDFHTML, PDF_STYLES, type ThermalReceiptData } from "@/lib/print";
import { getBusinessBillingInfoAction } from "@/actions/business";
import { useState, useEffect } from "react";
import type { Session } from "next-auth";

interface OrderItem {
  id: string;
  productId: string | null;
  description: string | null;
  code: string | null;
  price: number;
  quantity: number;
  subTotal: number;
}

interface Props {
  order: {
    id: string;
    date: Date;
    total: number;
    discountPercentage: number;
    discountAmount: number;
    seller: string | null;
    paidMethod: string | null;
    client: { name: string | null } | null;
    items: OrderItem[];
    status: string;
  };
  session: Session | null;
}

export default function PrintOrderButton({ order, session }: Props) {
  const [billingInfo, setBillingInfo] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    getBusinessBillingInfoAction().then(setBillingInfo);
  }, []);

  const getPrintData = (): ThermalReceiptData => {
    const subtotal = order.items.reduce((sum, i) => sum + i.subTotal, 0);
    const billType = order.status === "pendiente" ? "Presupuesto" : "Comprobante";
    return {
      businessName: session?.user?.businessName || "Mi Comercio",
      businessInfo: billingInfo ? {
        razonSocial: billingInfo.razonSocial as string,
        cuit: billingInfo.cuit as string,
        condicionIva: billingInfo.condicionIva as string,
        address: billingInfo.address as string,
      } : undefined,
      date: new Date(order.date),
      documentType: "DNI",
      billType,
      seller: order.seller || session?.user?.email || "",
      paidMethod: order.paidMethod || "Efectivo",
      client: order.client?.name || undefined,
      products: order.items.map(i => ({
        description: i.description || "Producto",
        amount: i.quantity,
        unitPrice: i.price,
        subtotal: i.subTotal,
      })),
      subtotal,
      discount: order.discountPercentage > 0 ? order.discountPercentage : undefined,
      discountAmount: order.discountAmount > 0 ? order.discountAmount : undefined,
      total: order.total,
    };
  };

  const handlePrintThermal = async () => {
    await printThermalReceipt(getPrintData());
  };

  const handlePrintPDF = async () => {
    const targetWin = window.open("", "_blank");
    if (targetWin) {
      targetWin.document.write("<html><head><title>Generando PDF...</title></head><body style='font-family:sans-serif; text-align:center; padding-top: 50px;'><h2>Generando comprobante, por favor espere...</h2></body></html>");
    }

    const receiptData = getPrintData();
    const content = document.createElement("div");
    content.innerHTML = buildPDFHTML(receiptData, {});
    const styleEl = document.createElement("style");
    styleEl.textContent = PDF_STYLES;
    content.insertBefore(styleEl, content.firstChild);

    document.body.appendChild(content);
    try {
      const filename = order.status === "pendiente" ? `Presupuesto_${order.id.slice(-8)}` : `Comprobante_${order.id.slice(-8)}`;
      await exportToPDF(content as HTMLElement, {
        documentTitle: filename,
        format: "a4",
        filename: filename,
        targetWindow: targetWin,
      });
    } catch (err) {
      if (targetWin) targetWin.close();
      console.error("PDF Export error:", err);
    } finally {
      document.body.removeChild(content);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Printer className="h-4 w-4 mr-1" />
          Imprimir
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={handlePrintThermal}>
          <Printer className="mr-2 h-4 w-4" />
          Impresión Térmica
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handlePrintPDF}>
          <FileText className="mr-2 h-4 w-4" />
          Generar PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
