"use client";

import { formatInvoiceNumberFull } from "@/lib/utils/bill-type";

export interface PDFTemplateOptions {
  qrSvgDataUrl?: string | null;
  invoiceNumber?: number;
}

export const PDF_STYLES = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { 
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; 
    font-size: 13px;
    line-height: 1.45;
    color: #1e293b;
  }
  .invoice-container { width: 750px; margin: 0 auto; padding: 30px 35px; background: #fff; }

  /* ── Header ── */
  .header { text-align: center; margin-bottom: 18px; padding-bottom: 14px; border-bottom: 3px solid #0f172a; }
  .company-name { font-size: 24px; font-weight: 800; color: #0f172a; letter-spacing: 0.3px; }
  .company-details { font-size: 11px; color: #64748b; margin-top: 4px; }

  /* ── Document type box ── */
  .doc-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 16px; margin: 14px 0; display: flex; justify-content: space-between; align-items: center; }
  .doc-type { font-size: 16px; font-weight: 700; color: #0f172a; }
  .doc-number { font-size: 11px; color: #64748b; margin-top: 3px; }
  .doc-meta { font-size: 11px; color: #475569; }
  .doc-meta strong { color: #0f172a; }

  /* ── Info grid ── */
  .info-grid { display: flex; gap: 14px; margin: 14px 0; }
  .info-grid > * { flex: 1; }
  .info-section { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 14px; }
  .info-section-title { font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; }
  .info-row { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 11px; }
  .info-label { color: #64748b; }
  .info-value { font-weight: 600; color: #0f172a; text-align: right; }

  /* ── Table ── */
  table { width: 100%; border-collapse: collapse; margin: 14px 0; }
  thead { background: #1e293b; color: #fff; }
  th { padding: 8px 8px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
  th:nth-child(2), th:nth-child(3), th:nth-child(4) { text-align: right; }
  td { padding: 7px 8px; font-size: 11px; border-bottom: 1px solid #e2e8f0; color: #1e293b; }
  td:nth-child(2), td:nth-child(3), td:nth-child(4) { text-align: right; }
  tbody tr:last-child td { border-bottom: none; }

  /* ── Totals ── */
  .totals-section { margin-top: 10px; border-top: 2px solid #1e293b; padding-top: 12px; width: 55%; margin-left: auto; }
  .total-row { display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 12px; }
  .total-label { color: #475569; }
  .total-value { font-weight: 600; color: #1e293b; }
  .total-row.grand-total { font-size: 16px; font-weight: 800; color: #0f172a; border-top: 1px solid #e2e8f0; padding-top: 8px; margin-top: 6px; }
  .discount .total-value { color: #059669; }

  /* ── CAE section ── */
  .cae-section { margin-top: 24px; padding-top: 16px; border-top: 2px solid #e2e8f0; display: flex; align-items: flex-start; gap: 16px; }
  .cae-qr { width: 90px; flex-shrink: 0; background: #fff; padding: 4px; border: 1px solid #e2e8f0; border-radius: 4px; }
  .cae-qr img { width: 100%; height: auto; display: block; }
  .cae-body { flex: 1; }
  .cae-title { font-weight: 700; font-size: 12px; color: #0f172a; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
  .cae-row { font-size: 11px; margin-bottom: 3px; color: #475569; }
  .cae-row strong { color: #0f172a; font-weight: 700; }
  .cae-legal { font-size: 9px; color: #94a3b8; font-style: italic; line-height: 1.4; margin-top: 10px; padding-top: 8px; border-top: 1px solid #e2e8f0; }

  /* ── Footer ── */
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

function getDocTitle(billType: string, cae: unknown): string {
  const lower = billType.toLowerCase();
  if (lower.includes("presupuesto")) return "Presupuesto";
  if (lower.includes("factura") || cae) return "Factura";
  return "Comprobante";
}

function formatCurrency(value: number): string {
  return value.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function buildPDFHTML(
  receiptData: {
    businessName: string;
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
    cae?: {
      cae: string;
      vencimiento: string;
      qrData?: string;
    };
  },
  options?: PDFTemplateOptions
): string {
  const { qrSvgDataUrl, invoiceNumber } = options || {};
  const billType = receiptData.billType || "Comprobante";
  const paidMethod = receiptData.paidMethod || "Efectivo";
  const subtotal = receiptData.subtotal ?? 0;
  const invoiceNumberFormatted = formatInvoiceNumberFull(invoiceNumber);
  const docTitle = getDocTitle(billType, receiptData.cae);

  // ── Client info ──
  const clientInfo = receiptData.client
    ? `<div class="info-section">
        <div class="info-section-title">Cliente</div>
        <div class="info-row"><span class="info-label">Nombre</span><span class="info-value">${receiptData.client}</span></div>
        ${receiptData.clientIvaCondition && receiptData.clientIvaCondition.toLowerCase() !== "consumidor final" ? `
          <div class="info-row"><span class="info-label">Cond. IVA</span><span class="info-value">${receiptData.clientIvaCondition.replace(/_/g, " ")}</span></div>
          <div class="info-row"><span class="info-label">${receiptData.documentType || "Doc."}</span><span class="info-value">${receiptData.clientDocumentNumber || ""}</span></div>
        ` : ""}
      </div>`
    : `<div class="info-section">
        <div class="info-section-title">Cliente</div>
        <div class="info-row"><span class="info-label">Nombre</span><span class="info-value">Consumidor Final</span></div>
      </div>`;

  // ── Establishment info (without Vendedor) ──
  const inicioStr = formatInicioActividades(receiptData.businessInfo?.inicioActividades);
  const businessInfo = `
    <div class="info-section">
      <div class="info-section-title">Establecimiento</div>
      ${receiptData.businessInfo?.cuit ? `<div class="info-row"><span class="info-label">CUIT</span><span class="info-value">${receiptData.businessInfo.cuit}</span></div>` : ""}
      ${receiptData.businessInfo?.condicionIva ? `<div class="info-row"><span class="info-label">Cond. IVA</span><span class="info-value">${receiptData.businessInfo.condicionIva.replace(/_/g, " ")}</span></div>` : ""}
      ${receiptData.businessInfo?.address ? `<div class="info-row"><span class="info-label">Dirección</span><span class="info-value">${receiptData.businessInfo.address}</span></div>` : ""}
      ${inicioStr ? `<div class="info-row"><span class="info-label">Inicio Act.</span><span class="info-value">${inicioStr}</span></div>` : ""}
      <div class="info-row" style="margin-bottom: 0;"><span class="info-label">Pago</span><span class="info-value">${paidMethod}</span></div>
    </div>
  `;

  // ── Products table ──
  const itemsRows = receiptData.products.map(p => `
    <tr>
      <td>${p.description}</td>
      <td>${p.amount}</td>
      <td>$${formatCurrency(p.unitPrice)}</td>
      <td>$${formatCurrency(p.subtotal)}</td>
    </tr>
  `).join("");

  // ── Totals ──
  const discountRow = receiptData.discountAmount
    ? `<div class="total-row discount"><span class="total-label">Descuento (${receiptData.discount}%)</span><span class="total-value">-$${formatCurrency(receiptData.discountAmount)}</span></div>`
    : "";

  // ── CAE section ──
  const caeSection = receiptData.cae
    ? `<div class="cae-section">
        <div class="cae-qr">
          ${qrSvgDataUrl ? `<img src="${qrSvgDataUrl}" alt="QR" />` : ""}
        </div>
        <div class="cae-body">
          <div class="cae-title">Comprobante Autorizado</div>
          <div class="cae-row"><strong>CAE:</strong> ${receiptData.cae.cae}</div>
          <div class="cae-row"><strong>Vencimiento:</strong> ${receiptData.cae.vencimiento}</div>
          <div class="cae-legal">
            El crédito fiscal discriminado en el presente comprobante, sólo podrá ser computado a efectos del Régimen de Sostenimiento e Inclusión Fiscal para Pequeños Contribuyentes (Ley N°27.618).
          </div>
        </div>
      </div>`
    : "";

  // ── Assemble ──
  return `
    <div class="invoice-container">
      <div class="header">
        <div class="company-name">${receiptData.businessName}</div>
        ${receiptData.businessInfo?.razonSocial ? `<div class="company-details">${receiptData.businessInfo.razonSocial}</div>` : ""}
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
        ${businessInfo}
      </div>

      <table>
        <thead>
          <tr>
            <th>Producto</th>
            <th>Cant.</th>
            <th>Precio</th>
            <th>Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows}
        </tbody>
      </table>

      <div class="totals-section">
        <div class="total-row"><span class="total-label">Subtotal</span><span class="total-value">$${formatCurrency(subtotal)}</span></div>
        ${discountRow}
        <div class="total-row grand-total"><span>TOTAL</span><span>$${formatCurrency(receiptData.total)}</span></div>
      </div>

      ${caeSection}

      <div class="footer">
        <div class="thanks">¡Gracias por su compra!</div>
      </div>
    </div>
  `;
}
