"use client";

import { formatInvoiceNumberFull, getBillTypeDisplay, normalizeBillType } from "@/lib/utils/bill-type";
import { buildReceiptClientData, getDocumentPrintKind, type DocumentPrintKind } from "./receipt-data";

export interface PDFTemplateOptions {
  qrSvgDataUrl?: string | null;
  invoiceNumber?: number | string;
  pointOfSale?: number | string;
}

export const PDF_LAYOUT_SCALE = 1.3;

export const PDF_A4_PAGE_STYLE =
  "@page { size: A4 portrait; margin: 10mm; } @media print { @page { size: A4 portrait; margin: 10mm; } html, body { width: 210mm; } }";
// PDF_A4_PAGE_STYLE A4 portrait 10mm
// A4 10mm

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeQrDataUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^data:image\/(svg\+xml|png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/i);
  if (!match) return null;
  if (match[1].toLowerCase() === "svg+xml") {
    try {
      const svg = atob(match[2]);
      if (/<\s*(script|foreignObject)\b|\bon[a-z]+\s*=|javascript\s*:/i.test(svg)) return null;
    } catch {
      return null;
    }
  }
  return value.trim();
}

export const PDF_STYLES = `
  @page { size: A4 portrait; margin: 10mm; }
  @media print { @page { size: A4 portrait; margin: 10mm; } html, body { width: 210mm; } }
  :root { --pdf-layout-scale: ${PDF_LAYOUT_SCALE.toFixed(2)}; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    font-size: 13px;
    line-height: 1.45;
    color: #1e293b;
  }
  .invoice-container { width: min(750px, 190mm); max-width: 100%; margin: 0 auto; padding: 30px 35px; background: #fff; overflow-wrap: anywhere; }

  /* Multi-page print stability — Jero #121: fixed A4 portrait geometry so the
     html2pdf/html2canvas output is always 210x297 (277mm = 297 - 2*10mm margins) */
  .pdf-page { min-height: 277mm; width: 190mm; max-width: 100%; margin: 0 auto; box-sizing: border-box; break-after: page; page-break-after: always; break-inside: avoid; overflow-wrap: anywhere; }

  /* ——— Header ——— */
  .header { text-align: center; margin-bottom: 18px; padding-bottom: 14px; border-bottom: 3px solid #0f172a; }
  .company-name { font-size: 24px; font-weight: 800; color: #0f172a; letter-spacing: 0.3px; }
  .company-details { font-size: 11px; color: #64748b; margin-top: 4px; }

  /* ——— Document type box ——— */
  .doc-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 16px; margin: 14px 0; display: flex; justify-content: space-between; align-items: center; }
  .doc-type { font-size: 16px; font-weight: 700; color: #0f172a; }
  .doc-number { font-size: 11px; color: #64748b; margin-top: 3px; }
  .doc-meta { font-size: 11px; color: #475569; }
  .doc-meta strong { color: #0f172a; }

  /* ——— Info grid ——— */
  .info-grid { display: flex; gap: 14px; margin: 14px 0; }
  .info-grid > * { flex: 1; min-width: 0; }
  .info-section { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 14px; }
  .info-section-title { font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; }
  .info-row { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 11px; gap: 8px; }
  .info-label { color: #64748b; }
  .info-value { font-weight: 600; color: #0f172a; text-align: right; overflow-wrap: anywhere; }

  /* ——— Table ——— */
  table { width: 100%; max-width: 100%; border-collapse: collapse; margin: 14px 0; overflow-wrap: anywhere; }
  thead { display: table-header-group; background: #1e293b; color: #fff; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  th { padding: 8px 8px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
  th:nth-child(2), th:nth-child(3), th:nth-child(4) { text-align: right; }
  td { padding: 7px 8px; font-size: 11px; border-bottom: 1px solid #e2e8f0; color: #1e293b; word-wrap: break-word; }
  td:nth-child(2), td:nth-child(3), td:nth-child(4) { text-align: right; }
  tbody tr:last-child td { border-bottom: none; }

  /* ——— Totals ——— */
  .totals-section { margin-top: 10px; border-top: 2px solid #1e293b; padding-top: 12px; width: 55%; margin-left: auto; }
  .total-row { display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 12px; }
  .total-label { color: #475569; }
  .total-value { font-weight: 600; color: #1e293b; }
  .total-row.grand-total { font-size: 16px; font-weight: 800; color: #0f172a; border-top: 1px solid #e2e8f0; padding-top: 8px; margin-top: 6px; }
  .discount .total-value { color: #059669; }

  /* ——— CAE section ——— */
  .cae-section { margin-top: 24px; padding-top: 16px; border-top: 2px solid #e2e8f0; display: flex; align-items: flex-start; gap: 16px; }
  .cae-qr { width: 90px; flex-shrink: 0; background: #fff; padding: 4px; border: 1px solid #e2e8f0; border-radius: 4px; }
  .cae-qr img { width: 100%; height: auto; display: block; }
  .cae-body { flex: 1; min-width: 0; }
  .cae-title { font-weight: 700; font-size: 12px; color: #0f172a; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
  .cae-row { font-size: 11px; margin-bottom: 3px; color: #475569; }
  .cae-row strong { color: #0f172a; font-weight: 700; }
  .cae-legal { font-size: 9px; color: #94a3b8; font-style: italic; line-height: 1.4; margin-top: 10px; padding-top: 8px; border-top: 1px solid #e2e8f0; }

  /* ——— Footer ——— */
  .footer { margin-top: 16px; padding-top: 10px; border-top: 1px solid #e2e8f0; text-align: center; }
  .thanks { font-size: 13px; font-weight: 700; color: #1e293b; letter-spacing: 0.5px; padding-bottom: 8px; }
`;

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function formatInicioActividades(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("es-AR", {
    year: "numeric",
    month: "long",
  }).format(d);
}

function getDocTitle(billType: string): string {
  return billType;
}

function formatCurrency(value: number): string {
  return value.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function buildPDFHTML(
  receiptData: {
    businessName: string;
    documentKind?: DocumentPrintKind;
    businessInfo?: {
      razonSocial?: string | null;
      cuit?: string | null;
      condicionIva?: string | null;
      address?: string | null;
      inicioActividades?: Date | string | null;
    };
    date: Date;
    documentType?: string;
    billType?: string;
    seller?: string;
    paidMethod?: string;
    client?: string;
    clientIvaCondition?: string;
    clientDocumentNumber?: string;
    products: {
      description: string;
      amount: number;
      unitPrice: number;
      subtotal: number;
    }[];
    subtotal?: number;
    discount?: number;
    discountAmount?: number;
    total: number;
    pointOfSale?: number | string;
    invoiceNumber?: number | string;
    cae?: {
      cae: string;
      vencimiento: string;
      qrData?: string;
      ptoVenta?: number | string;
    };
    originalAssociation?: {
      billType: string;
      number: number | string;
      pointOfSale: number | string;
      cae: string;
    };
  },
  options?: PDFTemplateOptions
): string {
  const { qrSvgDataUrl, invoiceNumber, pointOfSale } = options || {};
  const paidMethod = receiptData.paidMethod || "Efectivo";
  const subtotal = receiptData.subtotal ?? 0;
  const normalizedBillTypeForKind = normalizeBillType(receiptData.billType);
  const isPresupuesto = normalizedBillTypeForKind === "Presupuesto";
  const isCreditNote = receiptData.documentKind === "credit-note" || getDocumentPrintKind(receiptData.cae?.cae, receiptData.billType) === "credit-note";
  const isOfficialInvoice = !isPresupuesto && (isCreditNote || getDocumentPrintKind(receiptData.cae?.cae, receiptData.billType) === "official-invoice");
  const billType = getBillTypeDisplay(receiptData.billType, receiptData.cae?.cae, !isOfficialInvoice);
  const docTitle = getDocTitle(billType);
  const invoiceNumberFormatted = isOfficialInvoice && !isPresupuesto
    ? formatInvoiceNumberFull(
        invoiceNumber ?? receiptData.invoiceNumber,
        pointOfSale ?? receiptData.pointOfSale ?? receiptData.cae?.ptoVenta,
      )
    : "";
  const validQrDataUrl = safeQrDataUrl(qrSvgDataUrl);

  // ——— Client info ——— (Jero #122: buildReceiptClientData normalizes/validates
  // the client tax data so Factura A receipts never print stale documents)
  const client = buildReceiptClientData({
    name: receiptData.client,
    ivaCondition: receiptData.clientIvaCondition,
    documentType: receiptData.documentType === "CUIT" || receiptData.documentType === "DNI" ? receiptData.documentType : null,
    documentNumber: receiptData.clientDocumentNumber,
  });
  const hasClientData = Boolean(client.name || client.ivaCondition || (client.documentType && client.documentNumber));
  const clientInfo = hasClientData
    ? `<div class="info-section">
        <div class="info-section-title">Datos del Cliente</div>
        ${client.name ? `<div class="info-row"><span class="info-label">Nombre:</span><span class="info-value">${escapeHtml(client.name)}</span></div>` : ""}
        ${client.ivaCondition ? `<div class="info-row"><span class="info-label">Cond. IVA:</span><span class="info-value">${escapeHtml(client.ivaCondition)}</span></div>` : ""}
        ${client.documentType && client.documentNumber ? `<div class="info-row"><span class="info-label">${client.documentType}:</span><span class="info-value">${escapeHtml(client.documentNumber)}</span></div>` : ""}
      </div>`
    : `<div class="info-section">
        <div class="info-section-title">Cliente</div>
        <div class="info-row"><span class="info-label">Nombre</span><span class="info-value">Consumidor Final</span></div>
      </div>`;

  // ——— Establishment info (without Vendedor) ———
  const inicioStr = formatInicioActividades(receiptData.businessInfo?.inicioActividades);
  const businessInfo = isPresupuesto ? "" : `
    <div class="info-section">
      <div class="info-section-title">Establecimiento</div>
      ${receiptData.businessInfo?.cuit ? `<div class="info-row"><span class="info-label">CUIT</span><span class="info-value">${escapeHtml(receiptData.businessInfo.cuit)}</span></div>` : ""}
      ${receiptData.businessInfo?.condicionIva ? `<div class="info-row"><span class="info-label">Cond. IVA</span><span class="info-value">${escapeHtml(receiptData.businessInfo.condicionIva.replace(/_/g, " "))}</span></div>` : ""}
      ${receiptData.businessInfo?.address ? `<div class="info-row"><span class="info-label">Dirección</span><span class="info-value">${escapeHtml(receiptData.businessInfo.address)}</span></div>` : ""}
      ${inicioStr ? `<div class="info-row"><span class="info-label">Inicio Act.</span><span class="info-value">${escapeHtml(inicioStr)}</span></div>` : ""}
      <div class="info-row" style="margin-bottom: 0;"><span class="info-label">Pago</span><span class="info-value">${escapeHtml(paidMethod)}</span></div>
    </div>
  `;

  // ——— Totals ———
  const discountRow = receiptData.discountAmount
    ? `<div class="total-row discount"><span class="total-label">Descuento (${escapeHtml(receiptData.discount)}%)</span><span class="total-value">-$${formatCurrency(receiptData.discountAmount)}</span></div>`
    : "";

  // ——— CAE section (official invoices only) ———
  const caeSection = isOfficialInvoice && receiptData.cae
    ? `<div class="cae-section">
        <div class="cae-qr">
          ${validQrDataUrl ? `<img src="${escapeHtml(validQrDataUrl)}" alt="QR" />` : ""}
        </div>
        <div class="cae-body">
          <div class="cae-title">Comprobante Autorizado</div>
          <div class="cae-row"><strong>CAE:</strong> ${escapeHtml(receiptData.cae.cae)}</div>
          <div class="cae-row"><strong>Vencimiento:</strong> ${escapeHtml(receiptData.cae.vencimiento)}</div>
          <div class="cae-legal">
            El crédito fiscal discriminado en el presente comprobante, sólo podrá ser computado a efectos del Régimen de Sostenimiento e Inclusión Fiscal para Pequeños Contribuyentes (Ley N°27.618).
          </div>
        </div>
      </div>`
    : "";

  // ——— Products table (paginated for multi-page stability) ———
  const pageSize = 18;
  const itemPages = Array.from({ length: Math.max(1, Math.ceil(receiptData.products.length / pageSize)) }, (_, pageIndex) =>
    receiptData.products.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)
      .map(p => `
        <tr>
          <td>${escapeHtml(p.description)}</td>
          <td>${escapeHtml(p.amount)}</td>
          <td>$${formatCurrency(p.unitPrice)}</td>
          <td>$${formatCurrency(p.subtotal)}</td>
        </tr>`).join(""),
  );
  const table = (rows: string) => `<table><thead><tr><th>Producto</th><th>Cant.</th><th>Precio</th><th>Subtotal</th></tr></thead><tbody>${rows}</tbody></table>`;

  return `
    <div class="invoice-container" style="max-width: 100%;">
      <div class="pdf-page">
      <div class="header">
        <div class="company-name">${escapeHtml(receiptData.businessName)}</div>
        ${isOfficialInvoice && receiptData.businessInfo?.razonSocial ? `<div class="company-details">${escapeHtml(receiptData.businessInfo.razonSocial)}</div>` : ""}
      </div>

      <div class="doc-box">
        <div class="doc-box-left">
          <div class="doc-type">${docTitle}</div>
          ${invoiceNumberFormatted ? `<div class="doc-number">N° ${invoiceNumberFormatted}</div>` : ""}
        </div>
        <div class="doc-box-right">
          <div class="doc-meta"><strong>Fecha:</strong> ${formatDate(receiptData.date)}</div>
        </div>
      </div>

      <div class="info-grid">
        ${clientInfo}
        ${isCreditNote && receiptData.originalAssociation ? `<div class="info-section"><div class="info-section-title">Comprobante original asociado</div><div class="info-row"><span class="info-label">Tipo:</span><span class="info-value">${escapeHtml(receiptData.originalAssociation.billType)}</span></div><div class="info-row"><span class="info-label">Número:</span><span class="info-value">${escapeHtml(formatInvoiceNumberFull(receiptData.originalAssociation.number, receiptData.originalAssociation.pointOfSale))}</span></div><div class="info-row"><span class="info-label">CAE original:</span><span class="info-value">${escapeHtml(receiptData.originalAssociation.cae)}</span></div></div>` : ""}
        ${businessInfo}
      </div>

      ${table(itemPages[0] ?? "")}
      </div>
      ${itemPages.slice(1).map((rows) => `<div class="pdf-page">${table(rows)}</div>`).join("")}
      <div class="pdf-page">

      <div class="totals-section">
        <div class="total-row"><span class="total-label">Subtotal</span><span class="total-value">$${formatCurrency(subtotal)}</span></div>
        ${discountRow}
        <div class="total-row grand-total"><span>TOTAL</span><span>$${formatCurrency(receiptData.total)}</span></div>
      </div>

      ${caeSection}

      <div class="footer">
        <div class="thanks">${isPresupuesto ? "Presupuesto — No válido como factura" : "¡Gracias por su compra!"}</div>
      </div>
      </div>
    </div>
  `;
}
