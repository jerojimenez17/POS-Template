"use client";
import { useRef } from "react";
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
import {
  repairOrphanedQrGrantAction,
  resolveOrderQrPrintDtoAction,
} from "@/actions/sales/qr-print";
import { reportQrRendererOutcome } from "@/lib/print/qr-renderer-outcome";

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
  const repairAttempts = useRef(new Set<string>());


  const resolvePersistedQr = async (): Promise<string | null> => {
    const cae = sale.CAE?.CAE?.trim();
    if (!cae || !/^\d{14}$/.test(cae) || !sale.id) return null;
    try {
      let dto = await resolveOrderQrPrintDtoAction(sale.id);
      if (dto.qrKind === "none" && !repairAttempts.current.has(sale.id)
        && typeof repairOrphanedQrGrantAction === "function") {
        repairAttempts.current.add(sale.id);
        try {
          await repairOrphanedQrGrantAction(sale.id);
        } catch {
          // The read after repair (or failure) decides what can be printed.
        }
        dto = await resolveOrderQrPrintDtoAction(sale.id);
      }
      return dto.qrValue;
    } catch {
      return null;
    }
  };

  const createQrImage = async (qrValue: string | null): Promise<string | null> => {
    if (!qrValue) return null;
    try {
      const svgString = await QRCode.toString(qrValue, { type: "svg", margin: 0, width: 60 });
      if (typeof svgString !== "string" || !/<svg[\s>]/.test(svgString)) return null;
      return `data:image/svg+xml;base64,${btoa(svgString)}`;
    } catch {
      return null;
    }
  };

  const hasCAE = Boolean(sale.CAE?.CAE?.trim());
  const isRemito = !hasCAE;
  const billTypeDisplay = getBillTypeDisplay(sale.billType, sale.CAE?.CAE, isRemito);

  const getPrintData = (info: ReceiptBusinessInfo | null, qrValue: string | null): ThermalReceiptData => ({
    ...buildReceiptBusinessInfo(session?.user?.businessName || "Mi Comercio", sale.CAE?.CAE, info ?? undefined),
    date: sale.date || new Date(),
    documentType: sale.clientDocumentType || sale.typeDocument,
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
          qrValue,
          ptoVenta: sale.CAE.ptoVenta ?? sale.ptoVenta,
        }
      : undefined,
  });

  const handlePrintThermal = async () => {
    const [info, qrValue] = await Promise.all([
      hasCAE ? getBusinessBillingInfoAction() : Promise.resolve(null),
      resolvePersistedQr(),
    ]);
    const receiptData = getPrintData(info, qrValue);
    await printThermalReceipt(receiptData, qzTrayEnabled);
  };

  const handlePrintPDF = async () => {
    const targetWin = window.open("", "_blank");
    if (targetWin) {
      targetWin.document.write("<html><head><title>Generando PDF...</title></head><body style='font-family:sans-serif; text-align:center; padding-top: 50px;'><h2>Generando comprobante, por favor espere...</h2></body></html>");
    }

    const [info, qrValue] = await Promise.all([
      hasCAE ? getBusinessBillingInfoAction() : Promise.resolve(null),
      resolvePersistedQr(),
    ]);
    const receiptData = getPrintData(info, qrValue);
    const qrSvgDataUrl = await createQrImage(qrValue);
    if (qrValue) {
      reportQrRendererOutcome("pdf", qrSvgDataUrl ? "generated" : "failed");
    }
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
        orientation: "portrait",
        margin: 10,
        filename: filename,
        targetWindow: targetWin,
      });
      reportQrRendererOutcome("pdf", "submitted");
    } catch {
      reportQrRendererOutcome("pdf", "failed");
      if (targetWin) targetWin.close();
      console.error("PDF Export error");
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
