import { exportToPDF, downloadPDF } from "./PDFExport";

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

const DEFAULT_PAGE_STYLE = `
  @page { size: auto; margin: 10mm; }
  @media print {
    html, body {
      width: 100% !important;
      min-width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
    }
    body { -webkit-print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .print-header { display: block !important; }
    table { width: 100% !important; table-layout: fixed; }
    th, td { word-wrap: break-word; }
    .print-hidden { display: none !important; }
    .print-visible { display: block !important; }
  }
`;

function isMobileDevice(): boolean {
  if (typeof window === "undefined") return false;
  const userAgent = navigator.userAgent || navigator.vendor || (window as Window & { opera?: string }).opera;
  return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent || "")
}

function isPrintAvailable(): boolean {
  if (typeof window === "undefined") return false;
  return typeof window.print === "function";
}

async function tryBrowserPrint(
  element: HTMLElement,
  options: BrowserPrintOptions = {}
): Promise<boolean> {
  const { documentTitle = "document", pageStyle = DEFAULT_PAGE_STYLE } = options;

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
    
    const highContrastStyles = options.highContrast ? `
      * { color: #000 !important; background-color: transparent !important; }
      .text-gray-300, .text-gray-400, .text-gray-500, .text-gray-600, .text-gray-700 { color: #000 !important; }
      .bg-gray-50, .bg-gray-100 { background-color: transparent !important; border: 1px solid #000; }
      img, svg { filter: grayscale(100%) brightness(0.8) contrast(2); }
    ` : "";

    const criticalStyles = `
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { 
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
        font-size: 14px;
        line-height: 1.5;
        color: #000;
      }
      .print-hidden { display: none !important; }
      .print-visible { display: block !important; }
      .print-visible-inline { display: inline !important; }
      h1, h2, h3, h4 { font-weight: 700; color: #000; }
      table { width: 100%; border-collapse: collapse; }
      th, td { padding: 4px; text-align: left; }
      .border-b { border-bottom: 1px solid #000; }
      .border-t { border-top: 1px solid #000; }
      .border-gray-200, .border-gray-300 { border-color: #000; }
      .text-center { text-align: center; }
      .text-right { text-align: right; }
      .text-left { text-align: left; }
      .font-bold, .font-semibold { font-weight: 700; }
      .font-medium { font-weight: 500; }
      .text-sm { font-size: 12px; }
      .text-xs { font-size: 10px; }
      .text-lg { font-size: 16px; }
      .uppercase { text-transform: uppercase; }
      .tabular-nums { font-variant-numeric: tabular-nums; }
      .flex { display: flex; }
      .grid { display: grid; }
      .flex-col { flex-direction: column; }
      .flex-1 { flex: 1; }
      .items-center { align-items: center; }
      .justify-between { justify-content: space-between; }
      .justify-center { justify-content: center; }
      .justify-end { justify-content: flex-end; }
      .gap-2 { gap: 4px; }
      .gap-4 { gap: 8px; }
      .w-full { width: 100%; }
      .mx-auto { margin-left: auto; margin-right: auto; }
      .mt-2 { margin-top: 4px; }
      .mt-4 { margin-top: 8px; }
      .mb-2 { margin-bottom: 4px; }
      .mb-4 { margin-bottom: 8px; }
      ${highContrastStyles}
    `;

    printDocument.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${sanitizedTitle}</title>
          <meta name="viewport" content="width=80mm, initial-scale=1">
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
          <script src="https://cdn.tailwindcss.com"></script>
          <script>
            tailwind.config = {
              important: true,
              corePlugins: { preflight: false }
            }
          </script>
          <style>${criticalStyles}</style>
          <style>${pageStyle}</style>
        </head>
        <body>
          ${element.innerHTML}
        </body>
      </html>
    `);
    
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
      await exportToPDF(element, options);
      onFallback?.();
    }
    return false;
  }

  const isMobile = isMobileDevice();

  if (isMobile) {
    const success = await tryBrowserPrint(element, options);
    if (!success && fallbackToPDF) {
      await exportToPDF(element, options);
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
        exportToPDF(element, options);
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
      await exportToPDF(element, options);
      onFallback?.();
    }
    return false;
  }
}

export { exportToPDF, downloadPDF };
