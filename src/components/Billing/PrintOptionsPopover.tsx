"use client";

import { Printer, FileText, Download } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import BillState from "@/models/BillState";
import { Session } from "next-auth";
import { getBusinessBillingInfoAction } from "@/actions/business";
import { printThermalReceipt, exportToPDF, type ThermalReceiptData, buildPDFHTML, PDF_STYLES } from "@/lib/print";
import QRCode from "qrcode";
import { getBillTypeDisplay } from "@/lib/utils/bill-type";
import { useState, useEffect } from "react";

interface PrintOptionsPopoverProps {
  sale: BillState;
  session: Session | null;
}

export default function PrintOptionsPopover({
  sale,
  session,
}: PrintOptionsPopoverProps) {
  const [billingInfo, setBillingInfo] = useState<{
    razonSocial?: string | null;
    cuit?: string | null;
    condicionIva?: string | null;
    address?: string | null;
  } | null>(null);
  const [qrSvgDataUrl, setQrSvgDataUrl] = useState<string | null>(null);

  useEffect(() => {
    const fetchBillingInfo = async () => {
      const info = await getBusinessBillingInfoAction();
      if (info) setBillingInfo(info);
    };
    fetchBillingInfo();
  }, []);

  useEffect(() => {
    if (sale.CAE?.qrData) {
      QRCode.toString(sale.CAE.qrData, { type: "svg", margin: 0, width: 60 })
        .then((svgString) => {
          const dataUrl = `data:image/svg+xml;base64,${btoa(svgString)}`;
          setQrSvgDataUrl(dataUrl);
        })
        .catch(console.error);
    } else {
      setQrSvgDataUrl(null);
    }
  }, [sale.CAE?.qrData]);

  const hasCAE = Boolean(sale.CAE?.CAE);
  const isRemito = !sale.CAE || sale.CAE.CAE === "";
  const billTypeDisplay = getBillTypeDisplay(sale.billType, sale.CAE?.CAE, isRemito);

  const getPrintData = (): ThermalReceiptData => ({
    businessName: session?.user?.businessName || "Mi Comercio",
    businessInfo: billingInfo
      ? {
          razonSocial: billingInfo.razonSocial,
          cuit: billingInfo.cuit,
          condicionIva: billingInfo.condicionIva,
          address: billingInfo.address,
        }
      : undefined,
    date: sale.date || new Date(),
    documentType: sale.typeDocument || "DNI",
    billType: billTypeDisplay,
    seller: sale.seller || session?.user?.email || "",
    paidMethod: sale.paidMethod || "Efectivo",
    client: sale.client,
    clientIvaCondition: sale.clientIvaCondition,
    clientDocumentNumber: sale.clientDocumentNumber,
    products: sale.products.map((p) => ({
      description: p.description,
      amount: p.amount,
      unitPrice: p.salePrice,
      subtotal: p.salePrice * p.amount,
    })),
    subtotal: sale.products.reduce((sum, p) => sum + p.salePrice * p.amount, 0),
    discount:
      sale.discount > 0 ? sale.discount : undefined,
    discountAmount:
      sale.discount > 0
        ? sale.products.reduce((sum, p) => sum + p.salePrice * p.amount, 0) *
          (sale.discount / 100)
        : undefined,
    total:
      sale.totalWithDiscount ||
      sale.products.reduce((sum, p) => sum + p.salePrice * p.amount, 0) *
        (1 - sale.discount / 100),
    cae: sale.CAE?.CAE
      ? {
          cae: sale.CAE.CAE,
          vencimiento: sale.CAE.vencimiento,
          qrData: sale.CAE.qrData,
        }
      : undefined,
  });

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
    content.innerHTML = buildPDFHTML(receiptData, {
      invoiceNumber: sale.CAE?.nroComprobante,
      qrSvgDataUrl: qrSvgDataUrl,
    });
    
    const styleEl = document.createElement("style");
    styleEl.textContent = PDF_STYLES;
    content.insertBefore(styleEl, content.firstChild);

    document.body.appendChild(content);
    try {
      const filename = hasCAE 
        ? `Factura_${sale.CAE?.nroComprobante || "000000000000"}`
        : `Comprobante_${sale.id || Date.now()}`;
      
      await exportToPDF(content as HTMLElement, {
        documentTitle: filename,
        format: "a4",
        filename: filename,
        targetWindow: targetWin,
      });
    } catch(err) {
      if (targetWin) targetWin.close();
      console.error("PDF Export error:", err);
    } finally {
      document.body.removeChild(content);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Download className="h-4 w-4 text-gray-500" />
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
