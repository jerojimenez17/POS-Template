"use client";

import { formatInvoiceNumberFull, getBillTypeDisplay } from "@/lib/utils/bill-type";
import { getDocumentPrintKind, type DocumentPrintKind } from "./receipt-data";

export interface PDFTemplateOptions {
  qrSvgDataUrl?: string | null;
  invoiceNumber?: number | string;
  pointOfSale?: number | string;
}

export const PDF_LAYOUT_SCALE = 1.3;

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
  :root { --pdf-layout-scale: ${PDF_LAYOUT_SCALE.toFixed(2)}; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { 
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; 
    font-size: calc(14px * var(--pdf-layout-scale));
    line-height: 1.4;
    color: #1a1a1a;
  }
   .invoice-container { padding: calc(30px * var(--pdf-layout-scale)); width: calc(750px * var(--pdf-layout-scale)); max-width: 100%; margin: 0 auto; overflow-wrap: anywhere; }
   .pdf-page { break-after: page; page-break-after: always; break-inside: avoid; max-width: 100%; overflow-wrap: anywhere; }
  .header { text-align: center; margin-bottom: calc(20px * var(--pdf-layout-scale)); border-bottom: 2px solid #2563EB; padding-bottom: calc(15px * var(--pdf-layout-scale)); }
  .company-name { font-size: calc(26px * var(--pdf-layout-scale)); font-weight: 700; color: #2563EB; text-transform: uppercase; letter-spacing: 1px; line-height: 1.1; }
  .company-details { font-size: calc(12px * var(--pdf-layout-scale)); color: #666; margin-top: calc(5px * var(--pdf-layout-scale)); }
  .invoice-box { background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 6px; padding: calc(15px * var(--pdf-layout-scale)) calc(20px * var(--pdf-layout-scale)); margin: calc(15px * var(--pdf-layout-scale)) 0; display: flex; justify-content: space-between; align-items: center; max-width: 100%; }
  .invoice-box-left { text-align: left; }
  .invoice-box-right { text-align: right; }
  .invoice-type { font-size: calc(18px * var(--pdf-layout-scale)); font-weight: 700; color: #2563EB; margin-bottom: calc(4px * var(--pdf-layout-scale)); }
  .invoice-number { font-size: calc(14px * var(--pdf-layout-scale)); color: #666; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: calc(15px * var(--pdf-layout-scale)); margin: calc(15px * var(--pdf-layout-scale)) 0; }
  .info-section { background: #fff; border: 1px solid #E5E7EB; border-radius: calc(6px * var(--pdf-layout-scale)); padding: calc(12px * var(--pdf-layout-scale)); min-width: 0; }
  .info-section-title { font-size: calc(11px * var(--pdf-layout-scale)); font-weight: 600; color: #2563EB; text-transform: uppercase; margin-bottom: calc(8px * var(--pdf-layout-scale)); border-bottom: 1px solid #E5E7EB; padding-bottom: calc(4px * var(--pdf-layout-scale)); }
  .info-row { display: flex; justify-content: space-between; gap: calc(5px * var(--pdf-layout-scale)); margin-bottom: calc(5px * var(--pdf-layout-scale)); font-size: calc(12px * var(--pdf-layout-scale)); }
  .info-label { color: #666; font-weight: 500; }
  .info-value { font-weight: 600; color: #1a1a1a; }
  table { width: 100%; max-width: 100%; border-collapse: collapse; margin: calc(15px * var(--pdf-layout-scale)) 0; overflow-wrap: anywhere; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  thead { background: #2563EB; color: #fff; }
  th { padding: calc(10px * var(--pdf-layout-scale)) calc(8px * var(--pdf-layout-scale)); text-align: left; font-size: calc(11px * var(--pdf-layout-scale)); font-weight: 700; text-transform: uppercase; }
  th:nth-child(2), th:nth-child(3), th:nth-child(4) { text-align: right; }
  tbody tr:nth-child(even) { background: #F9FAFB; }
  td { padding: calc(10px * var(--pdf-layout-scale)) calc(8px * var(--pdf-layout-scale)); font-size: calc(13px * var(--pdf-layout-scale)); border-bottom: 1px solid #E5E7EB; word-wrap: break-word; }
  td:nth-child(2), td:nth-child(3), td:nth-child(4) { text-align: right; }
  .totals-section { margin-top: calc(15px * var(--pdf-layout-scale)); border-top: 2px solid #2563EB; padding-top: calc(15px * var(--pdf-layout-scale)); }
  .total-row { display: flex; justify-content: space-between; margin-bottom: calc(6px * var(--pdf-layout-scale)); font-size: calc(14px * var(--pdf-layout-scale)); font-weight: 500; }
  .total-row.grand-total { font-size: calc(20px * var(--pdf-layout-scale)); font-weight: 700; color: #2563EB; border-top: 1px solid #E5E7EB; padding-top: calc(10px * var(--pdf-layout-scale)); margin-top: calc(10px * var(--pdf-layout-scale)); }
  .discount { color: #059669; }
  .footer { margin-top: calc(20px * var(--pdf-layout-scale)); border-top: 1px solid #E5E7EB; padding-top: calc(15px * var(--pdf-layout-scale)); text-align: center; }
  .cae-banner { display: flex; align-items: center; justify-content: space-between; gap: calc(20px * var(--pdf-layout-scale)); border-top: 2px solid #E5E7EB; margin-top: calc(30px * var(--pdf-layout-scale)); padding-top: calc(20px * var(--pdf-layout-scale)); max-width: 100%; }
  .cae-qr { width: calc(110px * var(--pdf-layout-scale)); aspect-ratio: 1; flex-shrink: 0; background: #fff; padding: calc(4px * var(--pdf-layout-scale)); border: 1px solid #eee; border-radius: 4px; }
  .cae-qr img { width: 100%; aspect-ratio: 1; object-fit: contain; display: block; }
  .cae-info { flex: 1; text-align: center; }
  .cae-info-title { font-weight: 700; font-size: calc(16px * var(--pdf-layout-scale)); text-transform: uppercase; margin-bottom: calc(8px * var(--pdf-layout-scale)); letter-spacing: calc(0.5px * var(--pdf-layout-scale)); }
  .cae-info-text { font-size: calc(14px * var(--pdf-layout-scale)); margin-bottom: calc(4px * var(--pdf-layout-scale)); }
  .cae-info-text span.label { font-weight: 700; color: #4B5563; }
  .cae-logo { width: calc(110px * var(--pdf-layout-scale)); flex-shrink: 0; text-align: center; opacity: 0.6; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .cae-logo-inner { border: 2px dashed #D1D5DB; padding: calc(15px * var(--pdf-layout-scale)) calc(10px * var(--pdf-layout-scale)); border-radius: calc(4px * var(--pdf-layout-scale)); font-weight: 700; font-size: calc(12px * var(--pdf-layout-scale)); color: #9CA3AF; width: 100%; }
  .legal-text { font-size: calc(10px * var(--pdf-layout-scale)); color: #6B7280; font-style: italic; line-height: 1.3; margin-top: calc(12px * var(--pdf-layout-scale)); padding-top: calc(12px * var(--pdf-layout-scale)); border-top: 1px solid #E5E7EB; max-width: calc(400px * var(--pdf-layout-scale)); margin-left: auto; margin-right: auto; text-align: center; }
  .thank-you { font-size: calc(16px * var(--pdf-layout-scale)); font-weight: 700; color: #2563EB; text-align: center; margin-top: calc(30px * var(--pdf-layout-scale)); }
`;

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
  },
  options?: PDFTemplateOptions
): string {
  const { qrSvgDataUrl, invoiceNumber, pointOfSale } = options || {};
  const seller = receiptData.seller || "";
  const paidMethod = receiptData.paidMethod || "Efectivo";
  const subtotal = receiptData.subtotal ?? 0;
  const isOfficialInvoice = getDocumentPrintKind(receiptData.cae?.cae) === "official-invoice";
  const billType = getBillTypeDisplay(receiptData.billType, receiptData.cae?.cae, !isOfficialInvoice);
  const officialCae = receiptData.cae;
  const validQrDataUrl = typeof qrSvgDataUrl === "string" && /^data:image\/(?:svg\+xml|png|jpeg|webp);base64,/i.test(qrSvgDataUrl.trim())
    ? safeQrDataUrl(qrSvgDataUrl)
    : null;

  const dateFormatted = new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(receiptData.date);

  const invoiceNumberFormatted = isOfficialInvoice
    ? formatInvoiceNumberFull(
        invoiceNumber ?? receiptData.invoiceNumber,
        pointOfSale ?? receiptData.pointOfSale ?? receiptData.cae?.ptoVenta,
      )
    : "";

  const clientInfo = receiptData.client
    ? `<div class="info-section">
        <div class="info-section-title">Datos del Cliente</div>
        <div class="info-row"><span class="info-label">Nombre:</span><span class="info-value">${escapeHtml(receiptData.client)}</span></div>
        ${receiptData.clientIvaCondition && receiptData.clientIvaCondition.toLowerCase() !== "consumidor final" ? `
          <div class="info-row"><span class="info-label">Cond. IVA:</span><span class="info-value">${escapeHtml(receiptData.clientIvaCondition.replace(/_/g, " "))}</span></div>
          <div class="info-row"><span class="info-label">${escapeHtml(receiptData.documentType)}:</span><span class="info-value">${escapeHtml(receiptData.clientDocumentNumber)}</span></div>
        ` : ""}
      </div>`
    : "";

  const businessInfo = isOfficialInvoice ? `
    <div class="info-section">
      <div class="info-section-title">Datos del Establecimiento</div>
       ${receiptData.businessInfo?.cuit ? `<div class="info-row"><span class="info-label">CUIT:</span><span class="info-value">${escapeHtml(receiptData.businessInfo.cuit)}</span></div>` : ""}
       ${receiptData.businessInfo?.condicionIva ? `<div class="info-row"><span class="info-label">Cond. IVA:</span><span class="info-value">${escapeHtml(receiptData.businessInfo.condicionIva.replace(/_/g, " "))}</span></div>` : ""}
       ${receiptData.businessInfo?.address ? `<div class="info-row"><span class="info-label">Dirección:</span><span class="info-value">${escapeHtml(receiptData.businessInfo.address)}</span></div>` : ""}
      ${receiptData.businessInfo?.inicioActividades ? `<div class="info-row"><span class="info-label">Inicio Actividades:</span><span class="info-value">${new Date(receiptData.businessInfo.inicioActividades).toLocaleDateString("es-AR")}</span></div>` : ""}
       <div class="info-row"><span class="info-label">Vendedor:</span><span class="info-value">${escapeHtml(seller)}</span></div>
       <div class="info-row"><span class="info-label">Medio de Pago:</span><span class="info-value">${escapeHtml(paidMethod)}</span></div>
    </div>
   ` : `<div class="info-section"><div class="info-section-title">Comprobante</div><div class="info-row"><span class="info-label">Vendedor:</span><span class="info-value">${escapeHtml(seller)}</span></div><div class="info-row"><span class="info-label">Medio de Pago:</span><span class="info-value">${escapeHtml(paidMethod)}</span></div></div>`;

  const discountRow = receiptData.discountAmount
     ? `<div class="total-row discount"><span>Descuento (${escapeHtml(receiptData.discount)}%)</span><span>-$${escapeHtml(receiptData.discountAmount.toFixed(2))}</span></div>`
    : "";

  const caeSection = isOfficialInvoice
    ? `<div class="cae-banner">
        <div class="cae-qr">
           ${validQrDataUrl ? `<img src="${escapeHtml(validQrDataUrl)}" alt="QR" style="width: 100%; height: auto; display: block;" />` : ""}
        </div>
        <div class="cae-info">
          <div class="cae-info-title">Comprobante Autorizado</div>
             <div class="cae-info-text"><span class="label">CAE:</span> ${escapeHtml(officialCae?.cae)}</div>
             <div class="cae-info-text"><span class="label">Vencimiento:</span> ${escapeHtml(officialCae?.vencimiento)}</div>
          <div class="legal-text">
            El crédito fiscal discriminado en el presente comprobante, sólo podrá ser computado a efectos del Régimen de Sostenimiento e Inclusión Fiscal para Pequeños Contribuyentes de la Ley N°27.618
          </div>
        </div>
        <div class="cae-logo">
          <div class="cae-logo-inner">AFIP</div>
        </div>
      </div>`
    : "";

  const pageSize = 18;
  const itemPages = Array.from({ length: Math.max(1, Math.ceil(receiptData.products.length / pageSize)) }, (_, pageIndex) =>
    receiptData.products.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)
      .map(p => `
        <tr>
          <td>${escapeHtml(p.description)}</td>
          <td>${escapeHtml(p.amount)}</td>
          <td>$${escapeHtml(p.unitPrice.toFixed(2))}</td>
          <td>$${escapeHtml(p.subtotal.toFixed(2))}</td>
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

      <div class="invoice-box">
        <div class="invoice-box-left">
           <div class="invoice-type">${escapeHtml(billType)}</div>
          ${invoiceNumberFormatted ? `<div class="invoice-number">N° ${escapeHtml(invoiceNumberFormatted)}</div>` : ""}
        </div>
        <div class="invoice-box-right">
          <div class="info-row" style="margin: 0; justify-content: flex-end; gap: 6px;">
            <span class="info-label">Fecha:</span>
             <span class="info-value">${escapeHtml(dateFormatted)}</span>
          </div>
        </div>
      </div>

      <div class="info-grid">
        ${clientInfo}
        ${businessInfo}
      </div>

      ${table(itemPages[0] ?? "")}
      </div>
      ${itemPages.slice(1).map((rows) => `<div class="pdf-page">${table(rows)}</div>`).join("")}
      <div class="pdf-page">

      <div class="totals-section">
        <div class="total-row"><span>Subtotal</span><span>$${escapeHtml(subtotal.toFixed(2))}</span></div>
        ${discountRow}
        <div class="total-row grand-total"><span>TOTAL</span><span>$${escapeHtml(receiptData.total.toFixed(2))}</span></div>
      </div>

      ${caeSection}

      <div class="thank-you">¡Gracias por su compra!</div>
      </div>
    </div>
  `;
}
