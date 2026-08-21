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
import { buildReceiptBusinessInfo, type ReceiptBusinessInfo } from "@/lib/print/receipt-data";
import { useState, useEffect } from "react";

interface PrintOptionsPopoverProps {
  sale: BillState;
  session: Session | null;
  qzTrayEnabled?: boolean;
}

export default function PrintOptionsPopover({
  sale,
  session,
  qzTrayEnabled = false,
}: PrintOptionsPopoverProps) {


  const [qrSvgDataUrl, setQrSvgDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (sale.CAE?.qrData) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQrSvgDataUrl(null);
      QRCode.toString(sale.CAE.qrData, { type: "svg", margin: 0, width: 60 })
        .then((svgString) => {
          if (active) setQrSvgDataUrl(`data:image/svg+xml;base64,${btoa(svgString)}`);
        })
        .catch((error: unknown) => {
          if (active) setQrSvgDataUrl(null);
          console.error("Error generating receipt QR:", error);
        });
    } else {
      setQrSvgDataUrl(null);
    }
    return () => { active = false; };
  }, [sale.CAE?.qrData]);

  const hasCAE = Boolean(sale.CAE?.CAE?.trim());
  const isRemito = !hasCAE;
  const billTypeDisplay = getBillTypeDisplay(sale.billType, sale.CAE?.CAE, isRemito);

  const getPrintData = (info: ReceiptBusinessInfo | null): ThermalReceiptData => ({
    ...buildReceiptBusinessInfo(session?.user?.businessName || "Mi Comercio", sale.CAE?.CAE, info ?? undefined),
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
    pointOfSale: sale.ptoVenta ?? sale.CAE?.ptoVenta,
    invoiceNumber: sale.CAE?.nroComprobante,
    cae: sale.CAE?.CAE?.trim()
      ? {
          cae: sale.CAE.CAE,
          vencimiento: sale.CAE.vencimiento,
          qrData: sale.CAE.qrData,
          ptoVenta: sale.CAE.ptoVenta ?? sale.ptoVenta,
        }
      : undefined,
  });

  const handlePrintThermal = async () => {
    const info = hasCAE ? await getBusinessBillingInfoAction() : null;
    await printThermalReceipt(getPrintData(info), qzTrayEnabled);
  };

  const handlePrintPDF = async () => {
    const targetWin = window.open("", "_blank");
    if (targetWin) {
      targetWin.document.write("<html><head><title>Generando PDF...</title></head><body style='font-family:sans-serif; text-align:center; padding-top: 50px;'><h2>Generando comprobante, por favor espere...</h2></body></html>");
    }

    const info = hasCAE ? await getBusinessBillingInfoAction() : null;
    const receiptData = getPrintData(info);
    const content = document.createElement("div");
    content.innerHTML = buildPDFHTML(receiptData, {
      invoiceNumber: sale.CAE?.nroComprobante,
      pointOfSale: sale.ptoVenta ?? sale.CAE?.ptoVenta,
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
        <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-100 focus-visible:ring-2 focus-visible:ring-blue-500">
          <Download className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 bg-white dark:bg-gray-800">
        <DropdownMenuItem onClick={handlePrintThermal} className="focus:bg-gray-100 dark:focus:bg-gray-700">
          <Printer className="mr-2 h-4 w-4" />
          Impresión Térmica
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handlePrintPDF} className="focus:bg-gray-100 dark:focus:bg-gray-700">
          <FileText className="mr-2 h-4 w-4" />
          Generar PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
