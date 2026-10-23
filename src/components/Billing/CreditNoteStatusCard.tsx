"use client";

import type { CreditNoteMetadata } from "@/models/CreditNote";
import type { CreditNotePrintContext } from "@/models/CreditNote";
import { buildPDFHTML, exportToPDF, isCreditNotePrintContext, PDF_STYLES, printThermalReceipt } from "@/lib/print";

interface Props {
  creditNote: CreditNoteMetadata;
  printContext?: CreditNotePrintContext;
  businessName?: string;
}

export function CreditNoteStatusCard({ creditNote, printContext, businessName = "Comercio" }: Props) {
  const authorized = creditNote.status === "AUTHORIZED";
  const validPrintContext: CreditNotePrintContext | undefined = authorized && isCreditNotePrintContext(printContext)
    ? printContext
    : undefined;
  const statusLabel = creditNote.status === "PENDING"
    ? creditNote.canFinalizeLocally ? "Pendiente — respuesta guardada, finalización local disponible" : "Pendiente — requiere conciliación con ARCA"
    : creditNote.status === "REJECTED" ? "Rechazada" : "Autorizada";
  const print = async (): Promise<void> => {
    if (!validPrintContext) return;
    await printThermalReceipt({
      businessName,
      documentKind: "credit-note",
      date: new Date(),
      documentType: "",
       billType: validPrintContext.creditNote.billType,
      paidMethod: "Efectivo",
       products: validPrintContext.products,
       subtotal: validPrintContext.total,
       total: validPrintContext.total,
       invoiceNumber: validPrintContext.creditNote.number,
       pointOfSale: validPrintContext.creditNote.pointOfSale,
       cae: { cae: validPrintContext.creditNote.cae, vencimiento: "" },
       originalAssociation: validPrintContext.original,
     });
  };
  const printPdf = async (): Promise<void> => {
    if (!validPrintContext) return;
    const targetWindow = window.open("", "_blank");
    if (targetWindow) targetWindow.document.write("<html><head><title>Generando PDF...</title></head><body>Generando PDF...</body></html>");
    const receiptData = {
      businessName,
      documentKind: "credit-note" as const,
      date: new Date(),
      documentType: "",
      billType: validPrintContext.creditNote.billType,
      paidMethod: "Efectivo",
      products: validPrintContext.products,
      subtotal: validPrintContext.total,
      total: validPrintContext.total,
      invoiceNumber: validPrintContext.creditNote.number,
      pointOfSale: validPrintContext.creditNote.pointOfSale,
      cae: { cae: validPrintContext.creditNote.cae, vencimiento: "" },
      originalAssociation: validPrintContext.original,
    };
    const content = document.createElement("div");
    content.innerHTML = buildPDFHTML(receiptData, {
      invoiceNumber: validPrintContext.creditNote.number,
      pointOfSale: validPrintContext.creditNote.pointOfSale,
    });
    const style = document.createElement("style");
    style.textContent = PDF_STYLES;
    content.prepend(style);
    document.body.appendChild(content);
    try {
      await exportToPDF(content, {
        documentTitle: `Nota_de_Credito_${validPrintContext.creditNote.number}`,
        filename: `Nota_de_Credito_${validPrintContext.creditNote.number}`,
        format: "a4",
        orientation: "portrait",
        margin: 10,
        targetWindow,
      });
    } catch (error) {
      targetWindow?.close();
      console.error("Credit note PDF export failed", error);
    } finally {
      content.remove();
    }
  };
  return <section aria-live="polite" className="space-y-3 rounded-xl border p-4">
    <h2 className="font-semibold">Nota de Crédito</h2><p>Estado: {statusLabel}</p>
    {creditNote.billType && <p>Tipo: {creditNote.billType}</p>}
    {authorized && <><p>Número: {creditNote.number}</p><p>Punto de venta: {creditNote.pointOfSale}</p><p>CAE: {creditNote.cae}</p><div className="border-t pt-2"><p className="font-semibold">Comprobante original asociado</p><p>{creditNote.originalBillType} N° {creditNote.originalNumber} — punto de venta {creditNote.originalPointOfSale}</p><p>CAE original: {creditNote.originalCae}</p></div>{validPrintContext && <div className="flex flex-wrap gap-2"><button type="button" aria-label="Imprimir Nota de Crédito en térmica" onClick={() => void print()} className="rounded-md bg-blue-600 px-3 py-2 text-white">Imprimir térmica</button><button type="button" aria-label="Imprimir Nota de Crédito en PDF" onClick={() => void printPdf()} className="rounded-md bg-slate-700 px-3 py-2 text-white">Imprimir PDF</button></div>}</>}
  </section>;
}

export default CreditNoteStatusCard;
