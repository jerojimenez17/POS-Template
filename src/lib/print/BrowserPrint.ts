import { getBillTypeDisplay } from "@/lib/utils/bill-type";


export const ESCPOS = {
  INIT: "\x1B\x40",
  BOLD_ON: "\x1B\x45\x01",
  BOLD_OFF: "\x1B\x45\x00",
  DOUBLE_HEIGHT: "\x1B\x21\x10",
  DOUBLE_WIDTH: "\x1B\x21\x20",
  DOUBLE_SIZE: "\x1B\x21\x30",
  NORMAL_SIZE: "\x1B\x21\x00",
  ALIGN_LEFT: "\x1B\x61\x00",
  ALIGN_CENTER: "\x1B\x61\x01",
  ALIGN_RIGHT: "\x1B\x61\x02",
  LINE_FEED: "\x0A",
  CUT_PAPER: "\x1D\x56\x00",
  CASH_DRAWER: "\x1B\x70\x00\x19\xFA",
} as const;

export interface PrintOptions {
  documentTitle?: string;
  pageStyle?: string;
  scale?: number;
  filename?: string;
  format?: "a4" | "letter" | "thermal";
  orientation?: "portrait" | "landscape";
  margin?: number;
}

export interface BrowserPrintOptions extends PrintOptions {
  fallbackToPDF?: boolean;
  onFallback?: () => void;
  highContrast?: boolean;
}

const THERMAL_WIDTH = 40;

function padRight(text: string, width: number = THERMAL_WIDTH): string {
  return text.slice(0, width).padEnd(width);
}

function padLeft(text: string, width: number = THERMAL_WIDTH): string {
  return text.slice(0, width).padStart(width);
}

function formatLine(left: string, right: string, width: number = THERMAL_WIDTH): string {
  const maxLeft = Math.floor(width * 0.6);
  const maxRight = Math.floor(width * 0.4);
  return padRight(left.slice(0, maxLeft), maxLeft) + padLeft(right.slice(0, maxRight), maxRight);
}

function divider(char: string = "-", width: number = THERMAL_WIDTH): string {
  return char.repeat(width);
}

export interface ThermalReceiptData {
  businessName: string;
  businessInfo?: {
    razonSocial?: string | null;
    cuit?: string | null;
    condicionIva?: string | null;
    address?: string | null;
  };
  date: Date;
  documentType: string;
  billType?: string;
  seller?: string;
  paidMethod: string;
  client?: string;
  clientIvaCondition?: string;
  clientDocumentNumber?: string;
  products: Array<{
    description: string;
    amount: number;
    unitPrice: number;
    subtotal: number;
  }>;
  subtotal: number;
  discount?: number;
  discountAmount?: number;
  total: number;
  cae?: {
    cae: string;
    vencimiento: string;
    qrData?: string;
  };
  pointOfSale?: number;
  invoiceNumber?: number;
}

function formatInvoiceNumber(pointOfSale?: number, invoiceNumber?: number): string {
  if (!pointOfSale || !invoiceNumber) return "";
  const ptoVta = String(pointOfSale).padStart(4, "0");
  const nroCmp = String(invoiceNumber).padStart(8, "0");
  return `${ptoVta}-${nroCmp}`;
}

function sanitize(text: string): string {
  if (!text) return "";
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/N[°º]/g, "Nro")
    .replace(/[^\x20-\x7E]/g, "");
}

export function generateThermalReceipt(data: ThermalReceiptData): string {
  const lines: string[] = [];
  
  const billTypeDisplay = getBillTypeDisplay(data.billType, data.cae?.cae);
  const isAFIPInvoice = Boolean(data.cae?.cae);
  
  lines.push(ESCPOS.INIT);
  lines.push(ESCPOS.ALIGN_CENTER);
  lines.push(ESCPOS.DOUBLE_HEIGHT);
  lines.push(ESCPOS.BOLD_ON);
  lines.push(sanitize(data.businessName));
  lines.push(ESCPOS.NORMAL_SIZE);
  lines.push(ESCPOS.BOLD_OFF);
  lines.push(ESCPOS.LINE_FEED);
  
  if (data.businessInfo?.razonSocial) {
    lines.push(sanitize(data.businessInfo.razonSocial));
  }
  
  if (data.businessInfo?.cuit) {
    lines.push("CUIT: " + data.businessInfo.cuit);
  }
  
  if (data.businessInfo?.condicionIva) {
    lines.push(data.businessInfo.condicionIva.replace(/_/g, " "));
  }
  
  if (data.businessInfo?.address) {
    lines.push(sanitize(data.businessInfo.address));
  }
  
  lines.push(ESCPOS.LINE_FEED);
    lines.push(divider());
    
    const dateStr = new Intl.DateTimeFormat("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(data.date);
    
    lines.push(ESCPOS.ALIGN_LEFT);
  lines.push(formatLine("Fecha:", dateStr));
  
  if (isAFIPInvoice) {
    const invoiceNum = formatInvoiceNumber(data.pointOfSale, data.invoiceNumber);
    if (invoiceNum) {
      lines.push(formatLine("Nro:", invoiceNum));
    }
  }
  
  lines.push(formatLine("Tipo:", billTypeDisplay));
  
  const docType = data.documentType || "DNI";
  if (data.client) {
    lines.push(formatLine("Cliente:", sanitize(data.client)));
    if (data.clientIvaCondition && 
        data.clientIvaCondition.toLowerCase() !== "consumidor final" &&
        data.clientIvaCondition.toLowerCase() !== "consumidor_final") {
      lines.push(formatLine(docType + ":", data.clientDocumentNumber || ""));
      lines.push(formatLine("Cond.IVA:", data.clientIvaCondition.replace(/_/g, " ")));
    }
  }
  
  lines.push(formatLine("Pago:", sanitize(data.paidMethod)));
  lines.push(formatLine("Vendedor:", sanitize(data.seller || "")));
  
  lines.push(ESCPOS.ALIGN_CENTER);
  lines.push(divider());
  lines.push("DETALLE");
  lines.push(divider("="));
  
  lines.push(ESCPOS.ALIGN_LEFT);
  
  for (const p of data.products) {
    const desc = sanitize(p.description).slice(0, 20);
    const qty = "x" + p.amount;
    const price = "$" + p.subtotal.toFixed(2);
    lines.push(desc);
    lines.push(formatLine(qty + " x $" + p.unitPrice.toFixed(2), price));
  }
  
  lines.push(divider());
  
  lines.push(formatLine("Subtotal:", "$" + data.subtotal.toFixed(2)));
  
  if (data.discount && data.discount > 0 && data.discountAmount) {
    lines.push(formatLine("Desc(" + data.discount + "%):", "-$" + data.discountAmount.toFixed(2)));
  }
  
  lines.push(ESCPOS.ALIGN_CENTER);
  lines.push(divider("="));
  lines.push(ESCPOS.DOUBLE_SIZE);
  lines.push(ESCPOS.BOLD_ON);
  lines.push(formatLine("", "$" + data.total.toFixed(2)));
  lines.push(ESCPOS.NORMAL_SIZE);
  lines.push(ESCPOS.BOLD_OFF);
  lines.push(divider("="));
  lines.push(ESCPOS.LINE_FEED);
  
  if (data.cae?.cae) {
    lines.push(ESCPOS.BOLD_ON);
    lines.push("** COMPROBANTE AUTORIZADO **");
    lines.push(ESCPOS.BOLD_OFF);
    lines.push(ESCPOS.LINE_FEED);
    lines.push(formatLine("CAE:", data.cae.cae));
    lines.push(formatLine("Vto:", data.cae.vencimiento));
    lines.push(ESCPOS.LINE_FEED);
    lines.push("Verifique en: www.afip.gob.ar");
    lines.push(ESCPOS.LINE_FEED);
  }
  
  lines.push(ESCPOS.LINE_FEED);
  lines.push(ESCPOS.BOLD_ON);
  lines.push("* GRACIAS POR SU COMPRA *");
  lines.push(ESCPOS.BOLD_OFF);
  lines.push(ESCPOS.LINE_FEED);
  lines.push(ESCPOS.LINE_FEED);
  
  return lines.join("\n");
}



function buildThermalPrintHTML(data: ThermalReceiptData, qrDataUrl: string | null): string {
  const qrHtml = qrDataUrl ? `<div class="qr-container"><img src="${qrDataUrl}" alt="QR" /></div>` : "";
  const dateStr = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(data.date);
  const billTypeDisplay = getBillTypeDisplay(data.billType, data.cae?.cae);
  const isAFIPInvoice = Boolean(data.cae?.cae);
  const invoiceNum = isAFIPInvoice ? formatInvoiceNumber(data.pointOfSale, data.invoiceNumber) : "";
  const docType = data.documentType || "DNI";

  const productsHtml = data.products.map(p => `
    <div class="product-row">
      <div class="product-desc">${sanitize(p.description)}</div>
      <div class="product-price">x${p.amount} $${p.unitPrice.toFixed(2)}</div>
      <div class="product-sum">$${p.subtotal.toFixed(2)}</div>
    </div>
  `).join("");

  return `
    <!DOCTYPE html>
    <html>
    <head>
    <title>Ticket</title>
    <style>
      @page { size: 80mm auto; margin: 0; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 80mm; background: #fff; color: #000; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; line-height: 1.4; overflow: visible; }
      .ticket { padding: 4mm 6mm; }
      .header { text-align: center; margin-bottom: 4mm; border-bottom: 2px dashed #ccc; padding-bottom: 3mm; }
      .business-name { font-size: 18px; font-weight: 800; text-transform: uppercase; margin-bottom: 1mm; }
      .business-info { font-size: 11px; color: #444; }
      .info-row { display: flex; justify-content: space-between; margin-bottom: 1mm; font-size: 12px; }
      .info-label { font-weight: 600; }
      .divider { border-top: 1px solid #ccc; margin: 3mm 0; }
      .section-title { text-align: center; font-weight: 700; font-size: 12px; letter-spacing: 1px; margin-bottom: 3mm; }
      .products { width: 100%; margin-bottom: 3mm; }
      .product-row { display: flex; flex-wrap: wrap; margin-bottom: 2mm; justify-content: space-between; align-items: flex-end; }
      .product-desc { width: 100%; font-weight: 600; font-size: 12.5px; }
      .product-price { font-size: 11px; color: #555; }
      .product-sum { font-weight: 700; font-size: 13px; }
      .totals { border-top: 2px dashed #ccc; padding-top: 3mm; margin-top: 3mm; }
      .total-row { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 1mm; }
      .total-row.grand { font-size: 18px; font-weight: 800; border-top: 1px solid #000; padding-top: 2mm; margin-top: 1mm; }
      .cae-section { text-align: center; margin-top: 4mm; padding: 2mm; border: 1px solid #ccc; border-radius: 4px; background: #fafafa; }
      .cae-title { font-weight: 700; font-size: 12px; margin-bottom: 2px; }
      .cae-text { font-size: 11px; }
      .qr-container { display: flex; justify-content: center; margin: 3mm 0; }
      .qr-container img { width: 120px; height: 120px; }
      .footer { text-align: center; font-size: 12px; font-weight: 700; margin-top: 4mm; }
    </style>
    </head>
    <body>
      <div class="ticket">
        <div class="header">
          <div class="business-name">${sanitize(data.businessName)}</div>
          ${data.businessInfo?.razonSocial ? `<div class="business-info">${sanitize(data.businessInfo.razonSocial)}</div>` : ''}
          ${data.businessInfo?.cuit ? `<div class="business-info">CUIT: ${data.businessInfo.cuit}</div>` : ''}
          ${data.businessInfo?.condicionIva ? `<div class="business-info">${data.businessInfo.condicionIva.replace(/_/g, " ")}</div>` : ''}
          ${data.businessInfo?.address ? `<div class="business-info">${sanitize(data.businessInfo.address)}</div>` : ''}
        </div>

        <div class="info-row"><span class="info-label">Fecha:</span><span>${dateStr}</span></div>
        ${invoiceNum ? `<div class="info-row"><span class="info-label">Nro:</span><span>${invoiceNum}</span></div>` : ''}
        <div class="info-row"><span class="info-label">Tipo:</span><span>${billTypeDisplay}</span></div>
        
        ${data.client ? `
          <div class="divider"></div>
          <div class="info-row"><span class="info-label">Cliente:</span><span>${sanitize(data.client)}</span></div>
          ${data.clientIvaCondition && 
            data.clientIvaCondition.toLowerCase() !== "consumidor final" &&
            data.clientIvaCondition.toLowerCase() !== "consumidor_final" ? `
            <div class="info-row"><span class="info-label">${docType}:</span><span>${data.clientDocumentNumber || ""}</span></div>
            <div class="info-row"><span class="info-label">Cond.IVA:</span><span>${data.clientIvaCondition.replace(/_/g, " ")}</span></div>
          ` : ''}
        ` : ''}

        <div class="divider"></div>
        <div class="info-row"><span class="info-label">Pago:</span><span>${sanitize(data.paidMethod)}</span></div>
        <div class="info-row"><span class="info-label">Vendedor:</span><span>${sanitize(data.seller || "")}</span></div>

        <div class="divider"></div>
        <div class="section-title">DETALLE</div>
        
        <div class="products">
          ${productsHtml}
        </div>

        <div class="totals">
          <div class="total-row"><span>Subtotal:</span><span>$${data.subtotal.toFixed(2)}</span></div>
          ${data.discount ? `
            <div class="total-row"><span>Desc(${data.discount}%):</span><span>-$${data.discountAmount?.toFixed(2)}</span></div>
          ` : ''}
          <div class="total-row grand"><span>TOTAL:</span><span>$${data.total.toFixed(2)}</span></div>
        </div>

        ${data.cae?.cae ? `
          <div class="cae-section">
            <div class="cae-title">COMPROBANTE AUTORIZADO</div>
            <div class="cae-text"><b>CAE:</b> ${data.cae.cae}</div>
            <div class="cae-text"><b>Vto:</b> ${data.cae.vencimiento}</div>
            <div style="font-size: 10px; margin-top: 2px;">Verifique en: www.afip.gob.ar</div>
          </div>
        ` : ''}

        ${qrHtml}

        <div class="footer">¡GRACIAS POR SU COMPRA!</div>
      </div>

      <script>
        var timeoutId = null;
        function finishPrint() {
          if (timeoutId) return;
          timeoutId = setTimeout(function() { window.print(); window.close(); }, 250);
        }
        var qrImg = document.querySelector('.qr-container img');
        if (qrImg) {
          if (qrImg.complete) finishPrint();
          else qrImg.onload = finishPrint;
          setTimeout(finishPrint, 1000);
        } else {
          finishPrint();
        }
      </script>
    </body>
    </html>
  `;
}

async function tryFallbackHTMLPrint(data: ThermalReceiptData, qrDataUrl: string | null): Promise<boolean> {
  try {
    const printWindow = window.open("", "_blank", "width=350,height=600");
    if (!printWindow) {
      console.warn("Could not open print window");
      return false;
    }
    
    const html = buildThermalPrintHTML(data, qrDataUrl);
    printWindow.document.write(html);
    printWindow.document.close();
    return true;
  } catch (error) {
    console.error("Thermal HTML print error:", error);
    return false;
  }
}

export async function printThermalReceipt(data: ThermalReceiptData, qzTrayEnabled: boolean = true): Promise<boolean> {
  const receipt = generateThermalReceipt(data);
  const hasQRCode = Boolean(data.cae?.qrData);
  const qrData = data.cae?.qrData || null;
  
  let qrDataUrl: string | null = null;
  if (hasQRCode && qrData) {
    try {
      const qrcodeModule = await import("qrcode");
      const QRCode = qrcodeModule.default || qrcodeModule;
      qrDataUrl = await QRCode.toDataURL(qrData, { 
        margin: 0, 
        width: 120, 
        errorCorrectionLevel: 'M' 
      });
    } catch (e) {
      console.error("Error generating fallback QR data url:", e);
    }
  }

  if (!qzTrayEnabled) {
    return tryFallbackHTMLPrint(data, qrDataUrl);
  }

  try {
    // Dynamically import qz-tray to avoid SSR issues
    const qz = (await import("qz-tray")).default;

    if (!qz.websocket.isActive()) {
      await qz.websocket.connect();
      console.log("QZ Tray connected");
    }

    // "que use la de default"
    const printerName = await qz.printers.getDefault();
    if (!printerName) {
      throw new Error("No default printer found by QZ Tray");
    }

    const config = qz.configs.create(printerName, { encoding: "CP850" }); // Standard ESC/POS codepage for latin charset
    
    // QZ Tray Raw ESC/POS payload format
    const printData: unknown[] = [];
    printData.push(receipt);

    // If QR code is present, add it as a raw image 
    if (hasQRCode && qrDataUrl) {
      const base64Image = qrDataUrl.split(",")[1];
      
      printData.push("\n"); // Make sure there's space before QR
      printData.push({
        type: 'raw', 
        format: 'image', 
        flavor: 'base64', 
        data: base64Image,
        options: {
          language: "ESCPOS", 
          dotDensity: "double"
        }
      } as unknown);
      printData.push("\n"); // Space after QR
    }

    // Cut paper and open cash drawer
    printData.push(ESCPOS.CUT_PAPER);
    // printData.push(ESCPOS.CASH_DRAWER); // Uncomment if cash drawer opening is desired by default

    // Print to QZ Tray
    await qz.print(config, printData as unknown as string[]);
    
    return true;
  } catch (error) {
    console.warn("QZ Tray connection or print failed, falling back to HTML popup:", error);
    return tryFallbackHTMLPrint(data, qrDataUrl);
  }
}

const DEFAULT_PAGE_STYLE = [
  "@page { size: auto; margin: 10mm; }",
  "@media print {",
  "  html, body {",
  "    width: 100% !important;",
  "    min-width: 100% !important;",
  "    margin: 0 !important;",
  "    padding: 0 !important;",
  "  }",
  "  body { -webkit-print-color-adjust: exact; }",
  "  .print-header { display: block !important; }",
  "  table { width: 100% !important; table-layout: fixed; }",
  "  th, td { word-wrap: break-word; }",
  "  .print-hidden { display: none !important; }",
  "  .print-visible { display: block !important; }",
  "}"
].join("\n");

function isMobileDevice(): boolean {
  if (typeof window === "undefined") return false;
  const userAgent = navigator.userAgent || navigator.vendor || (window as Window & { opera?: string }).opera;
  return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent || "");
}

function isPrintAvailable(): boolean {
  if (typeof window === "undefined") return false;
  return typeof window.print === "function";
}

async function tryBrowserPrint(
  element: HTMLElement,
  options: BrowserPrintOptions = {}
): Promise<boolean> {
  const documentTitle = options.documentTitle || "document";
  const pageStyle = options.pageStyle || DEFAULT_PAGE_STYLE;

  const sanitizedTitle = documentTitle
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  try {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      console.warn("Could not open print window, falling back to PDF");
      return false;
    }

    const printDocument = printWindow.document;
    
    const highContrastStyles = options.highContrast ? [
      "* { color: #000 !important; background-color: transparent !important; }",
      ".text-gray-300, .text-gray-400, .text-gray-500, .text-gray-600, .text-gray-700 { color: #000 !important; }",
      ".bg-gray-50, .bg-gray-100 { background-color: transparent !important; border: 1px solid #000; }",
      "img, svg { filter: grayscale(100%) brightness(0.8) contrast(2); }"
    ].join("\n") : "";

    const criticalStyles = [
      "* { margin: 0; padding: 0; box-sizing: border-box; }",
      "body { ",
      "  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; ",
      "  font-size: 14px;",
      "  line-height: 1.5;",
      "  color: #000;",
      "}",
      ".print-hidden { display: none !important; }",
      ".print-visible { display: block !important; }",
      ".print-visible-inline { display: inline !important; }",
      "h1, h2, h3, h4 { font-weight: 700; color: #000; }",
      "table { width: 100%; border-collapse: collapse; }",
      "th, td { padding: 4px; text-align: left; }",
      ".border-b { border-bottom: 1px solid #000; }",
      ".border-t { border-top: 1px solid #000; }",
      ".border-gray-200, .border-gray-300 { border-color: #000; }",
      ".text-center { text-align: center; }",
      ".text-right { text-align: right; }",
      ".text-left { text-align: left; }",
      ".font-bold, .font-semibold { font-weight: 700; }",
      ".font-medium { font-weight: 500; }",
      ".text-sm { font-size: 12px; }",
      ".text-xs { font-size: 10px; }",
      ".text-lg { font-size: 16px; }",
      ".uppercase { text-transform: uppercase; }",
      ".tabular-nums { font-variant-numeric: tabular-nums; }",
      ".flex { display: flex; }",
      ".grid { display: grid; }",
      ".flex-col { flex-direction: column; }",
      ".flex-1 { flex: 1; }",
      ".items-center { align-items: center; }",
      ".justify-between { justify-content: space-between; }",
      ".justify-center { justify-content: center; }",
      ".justify-end { justify-content: flex-end; }",
      ".gap-2 { gap: 4px; }",
      ".gap-4 { gap: 8px; }",
      ".w-full { width: 100%; }",
      ".mx-auto { margin-left: auto; margin-right: auto; }",
      ".mt-2 { margin-top: 4px; }",
      ".mt-4 { margin-top: 8px; }",
      ".mb-2 { margin-bottom: 4px; }",
      ".mb-4 { margin-bottom: 8px; }",
      highContrastStyles
    ].join("\n");

    const html = [
      "<!DOCTYPE html>",
      "<html>",
      "<head>",
      "<title>" + sanitizedTitle + "</title>",
      "<meta name=\"viewport\" content=\"width=80mm, initial-scale=1\">",
      "<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">",
      "<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>",
      "<link href=\"https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap\" rel=\"stylesheet\">",
      "<script src=\"https://cdn.tailwindcss.com\"></script>",
      "<script>",
      "tailwind.config = {",
      "  important: true,",
      "  corePlugins: { preflight: false }",
      "}",
      "</script>",
      "<style>" + criticalStyles + "</style>",
      "<style>" + pageStyle + "</style>",
      "</head>",
      "<body>",
      element.innerHTML,
      "</body>",
      "</html>"
    ].join("\n");

    printDocument.write(html);
    printDocument.close();
    
    await new Promise<void>((resolve) => {
      const tryPrint = () => {
        if (printDocument.readyState === "complete") {
          setTimeout(() => {
            printWindow.print();
            printWindow.close();
            resolve();
          }, 250);
        } else {
          setTimeout(tryPrint, 50);
        }
      };
      tryPrint();
    });
    
    return true;
  } catch (error) {
    console.warn("Browser print failed:", error);
    return false;
  }
}

export async function printElement(
  element: HTMLElement,
  options: BrowserPrintOptions = {}
): Promise<boolean> {
  const { fallbackToPDF = true, onFallback } = options;

  if (!isPrintAvailable()) {
    console.warn("window.print() not available, using PDF export");
    if (fallbackToPDF) {
      await import("./PDFExport").then(({ exportToPDF }) => exportToPDF(element, options));
      onFallback?.();
    }
    return false;
  }

  const isMobile = isMobileDevice();

  if (isMobile) {
    const success = await tryBrowserPrint(element, options);
    if (!success && fallbackToPDF) {
      await import("./PDFExport").then(({ exportToPDF }) => exportToPDF(element, options));
      onFallback?.();
      return false;
    }
    return success;
  }

  try {
    const mediaQuery = window.matchMedia("print");
    const handlePrint = () => {
      const success = tryBrowserPrint(element, options);
      if (!success && fallbackToPDF) {
        import("./PDFExport").then(({ exportToPDF }) => exportToPDF(element, options));
        onFallback?.();
      }
    };

    if (mediaQuery.matches) {
      handlePrint();
    } else {
      mediaQuery.addEventListener("change", handlePrint);
      await tryBrowserPrint(element, options);
      mediaQuery.removeEventListener("change", handlePrint);
    }

    return true;
  } catch (error) {
    console.warn("Print failed, falling back to PDF:", error);
    if (fallbackToPDF) {
      await import("./PDFExport").then(({ exportToPDF }) => exportToPDF(element, options));
      onFallback?.();
    }
    return false;
  }
}

export { exportToPDF, downloadPDF } from "./PDFExport";
