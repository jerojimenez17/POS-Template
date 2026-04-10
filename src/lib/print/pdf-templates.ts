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
    font-size: 14px;
    line-height: 1.4;
    color: #1a1a1a;
  }
  .invoice-container { padding: 30px; width: 750px; max-width: 100%; margin: 0 auto; }
  .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #2563EB; padding-bottom: 15px; }
  .company-name { font-size: 26px; font-weight: 700; color: #2563EB; text-transform: uppercase; letter-spacing: 1px; line-height: 1.1; }
  .company-details { font-size: 12px; color: #666; margin-top: 5px; }
  .invoice-box { background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 6px; padding: 15px 20px; margin: 15px 0; display: flex; justify-content: space-between; align-items: center; }
  .invoice-box-left { text-align: left; }
  .invoice-box-right { text-align: right; }
  .invoice-type { font-size: 18px; font-weight: 700; color: #2563EB; margin-bottom: 4px; }
  .invoice-number { font-size: 14px; color: #666; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 15px 0; }
  .info-section { background: #fff; border: 1px solid #E5E7EB; border-radius: 6px; padding: 12px; }
  .info-section-title { font-size: 11px; font-weight: 600; color: #2563EB; text-transform: uppercase; margin-bottom: 8px; border-bottom: 1px solid #E5E7EB; padding-bottom: 4px; }
  .info-row { display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 12px; }
  .info-label { color: #666; font-weight: 500; }
  .info-value { font-weight: 600; color: #1a1a1a; }
  table { width: 100%; border-collapse: collapse; margin: 15px 0; }
  thead { background: #2563EB; color: #fff; }
  th { padding: 10px 8px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; }
  th:nth-child(2), th:nth-child(3), th:nth-child(4) { text-align: right; }
  tbody tr:nth-child(even) { background: #F9FAFB; }
  td { padding: 10px 8px; font-size: 13px; border-bottom: 1px solid #E5E7EB; }
  td:nth-child(2), td:nth-child(3), td:nth-child(4) { text-align: right; }
  .totals-section { margin-top: 15px; border-top: 2px solid #2563EB; padding-top: 15px; }
  .total-row { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 14px; font-weight: 500; }
  .total-row.grand-total { font-size: 20px; font-weight: 700; color: #2563EB; border-top: 1px solid #E5E7EB; padding-top: 10px; margin-top: 10px; }
  .discount { color: #059669; }
  .footer { margin-top: 20px; border-top: 1px solid #E5E7EB; padding-top: 15px; text-align: center; }
  .cae-banner { display: flex; align-items: center; justify-content: space-between; gap: 20px; border-top: 2px solid #E5E7EB; margin-top: 30px; padding-top: 20px; }
  .cae-qr { width: 110px; flex-shrink: 0; background: #fff; padding: 4px; border: 1px solid #eee; border-radius: 4px; }
  .cae-info { flex: 1; text-align: center; }
  .cae-info-title { font-weight: 700; font-size: 16px; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.5px; }
  .cae-info-text { font-size: 14px; margin-bottom: 4px; }
  .cae-info-text span.label { font-weight: 700; color: #4B5563; }
  .cae-logo { width: 110px; flex-shrink: 0; text-align: center; opacity: 0.6; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .cae-logo-inner { border: 2px dashed #D1D5DB; padding: 15px 10px; border-radius: 4px; font-weight: 700; font-size: 12px; color: #9CA3AF; width: 100%; }
  .legal-text { font-size: 10px; color: #6B7280; font-style: italic; line-height: 1.3; margin-top: 12px; padding-top: 12px; border-top: 1px solid #E5E7EB; max-width: 400px; margin-left: auto; margin-right: auto; text-align: center; }
  .thank-you { font-size: 16px; font-weight: 700; color: #2563EB; text-align: center; margin-top: 30px; }
`;

export function buildPDFHTML(
  receiptData: {
    businessName: string;
    businessInfo?: {
      razonSocial?: string | null;
      cuit?: string | null;
      condicionIva?: string | null;
      address?: string | null;
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
  const seller = receiptData.seller || "";
  const paidMethod = receiptData.paidMethod || "Efectivo";
  const subtotal = receiptData.subtotal ?? 0;

  const dateFormatted = new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(receiptData.date);

  const invoiceNumberFormatted = formatInvoiceNumberFull(invoiceNumber);

  const clientInfo = receiptData.client
    ? `<div class="info-section">
        <div class="info-section-title">Datos del Cliente</div>
        <div class="info-row"><span class="info-label">Nombre:</span><span class="info-value">${receiptData.client}</span></div>
        ${receiptData.clientIvaCondition && receiptData.clientIvaCondition.toLowerCase() !== "consumidor final" ? `
          <div class="info-row"><span class="info-label">Cond. IVA:</span><span class="info-value">${receiptData.clientIvaCondition.replace(/_/g, " ")}</span></div>
          <div class="info-row"><span class="info-label">${receiptData.documentType}:</span><span class="info-value">${receiptData.clientDocumentNumber || ""}</span></div>
        ` : ""}
      </div>`
    : "";

  const businessInfo = `
    <div class="info-section">
      <div class="info-section-title">Datos del Establecimiento</div>
      ${receiptData.businessInfo?.cuit ? `<div class="info-row"><span class="info-label">CUIT:</span><span class="info-value">${receiptData.businessInfo.cuit}</span></div>` : ""}
      ${receiptData.businessInfo?.condicionIva ? `<div class="info-row"><span class="info-label">Cond. IVA:</span><span class="info-value">${receiptData.businessInfo.condicionIva.replace(/_/g, " ")}</span></div>` : ""}
      ${receiptData.businessInfo?.address ? `<div class="info-row"><span class="info-label">Dirección:</span><span class="info-value">${receiptData.businessInfo.address}</span></div>` : ""}
      <div class="info-row"><span class="info-label">Vendedor:</span><span class="info-value">${seller}</span></div>
      <div class="info-row"><span class="info-label">Medio de Pago:</span><span class="info-value">${paidMethod}</span></div>
    </div>
  `;

  const itemsRows = receiptData.products.map(p => `
    <tr>
      <td>${p.description}</td>
      <td>${p.amount}</td>
      <td>$${p.unitPrice.toFixed(2)}</td>
      <td>$${p.subtotal.toFixed(2)}</td>
    </tr>
  `).join("");

  const discountRow = receiptData.discountAmount
    ? `<div class="total-row discount"><span>Descuento (${receiptData.discount}%)</span><span>-$${receiptData.discountAmount.toFixed(2)}</span></div>`
    : "";

  const caeSection = receiptData.cae
    ? `<div class="cae-banner">
        <div class="cae-qr">
          ${qrSvgDataUrl ? `<img src="${qrSvgDataUrl}" alt="QR" style="width: 100%; height: auto; display: block;" />` : ""}
        </div>
        <div class="cae-info">
          <div class="cae-info-title">Comprobante Autorizado</div>
          <div class="cae-info-text"><span class="label">CAE:</span> ${receiptData.cae.cae}</div>
          <div class="cae-info-text"><span class="label">Vencimiento:</span> ${receiptData.cae.vencimiento}</div>
          <div class="legal-text">
            El crédito fiscal discriminado en el presente comprobante, sólo podrá ser computado a efectos del Régimen de Sostenimiento e Inclusión Fiscal para Pequeños Contribuyentes de la Ley N°27.618
          </div>
        </div>
        <div class="cae-logo">
          <div class="cae-logo-inner">AFIP</div>
        </div>
      </div>`
    : "";

  return `
    <div class="invoice-container">
      <div class="header">
        <div class="company-name">${receiptData.businessName}</div>
        ${receiptData.businessInfo?.razonSocial ? `<div class="company-details">${receiptData.businessInfo.razonSocial}</div>` : ""}
      </div>

      <div class="invoice-box">
        <div class="invoice-box-left">
          <div class="invoice-type">${billType}</div>
          ${invoiceNumberFormatted ? `<div class="invoice-number">N° ${invoiceNumberFormatted}</div>` : ""}
        </div>
        <div class="invoice-box-right">
          <div class="info-row" style="margin: 0; justify-content: flex-end; gap: 6px;">
            <span class="info-label">Fecha:</span>
            <span class="info-value">${dateFormatted}</span>
          </div>
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
        <div class="total-row"><span>Subtotal</span><span>$${subtotal.toFixed(2)}</span></div>
        ${discountRow}
        <div class="total-row grand-total"><span>TOTAL</span><span>$${receiptData.total.toFixed(2)}</span></div>
      </div>

      ${caeSection}

      <div class="thank-you">¡Gracias por su compra!</div>
    </div>
  `;
}
