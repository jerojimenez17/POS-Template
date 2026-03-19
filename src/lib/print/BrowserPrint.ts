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
    
    const criticalStyles = `
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { 
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
        font-size: 14px;
        line-height: 1.5;
        color: #1f2937;
      }
      .print-hidden { display: none !important; }
      .print-visible { display: block !important; }
      .print-visible-inline { display: inline !important; }
      h1, h2, h3, h4 { font-weight: 700; }
      table { width: 100%; border-collapse: collapse; }
      th, td { padding: 8px; text-align: left; }
      .border-b { border-bottom: 1px solid #e5e7eb; }
      .border-t { border-top: 1px solid #e5e7eb; }
      .border-gray-200 { border-color: #e5e7eb; }
      .border-gray-300 { border-color: #d1d5db; }
      .text-center { text-align: center; }
      .text-right { text-align: right; }
      .text-left { text-align: left; }
      .font-bold, .font-semibold { font-weight: 700; }
      .font-medium { font-weight: 500; }
      .text-sm { font-size: 0.875rem; }
      .text-xs { font-size: 0.75rem; }
      .text-lg { font-size: 1.125rem; }
      .uppercase { text-transform: uppercase; }
      .tracking-tight { letter-spacing: -0.025em; }
      .tracking-wide { letter-spacing: 0.025em; }
      .tabular-nums { font-variant-numeric: tabular-nums; }
      .flex { display: flex; }
      .grid { display: grid; }
      .flex-col { flex-direction: column; }
      .flex-1 { flex: 1; }
      .shrink-0 { flex-shrink: 0; }
      .items-center { align-items: center; }
      .justify-between { justify-content: space-between; }
      .justify-center { justify-content: center; }
      .justify-end { justify-content: flex-end; }
      .gap-2 { gap: 0.5rem; }
      .gap-4 { gap: 1rem; }
      .w-full { width: 100%; }
      .w-72 { width: 18rem; }
      .max-w-\\[300px\\] { max-width: 300px; }
      .max-w-\\[200px\\] { max-width: 200px; }
      .mx-auto { margin-left: auto; margin-right: auto; }
      .my-2 { margin-top: 0.5rem; margin-bottom: 0.5rem; }
      .mt-2 { margin-top: 0.5rem; }
      .mt-3 { margin-top: 0.75rem; }
      .mt-4 { margin-top: 1rem; }
      .mt-8 { margin-top: 2rem; }
      .mb-2 { margin-bottom: 0.5rem; }
      .mb-4 { margin-bottom: 1rem; }
      .mb-3 { margin-bottom: 0.75rem; }
      .pt-2 { padding-top: 0.5rem; }
      .pt-4 { padding-top: 1rem; }
      .pb-4 { padding-bottom: 1rem; }
      .pb-8 { padding-bottom: 2rem; }
      .px-1 { padding-left: 0.25rem; padding-right: 0.25rem; }
      .px-4 { padding-left: 1rem; padding-right: 1rem; }
      .py-1 { padding-top: 0.25rem; padding-bottom: 0.25rem; }
      .py-3 { padding-top: 0.75rem; padding-bottom: 0.75rem; }
      .py-4 { padding-top: 1rem; padding-bottom: 1rem; }
      .p-1 { padding: 0.25rem; }
      .p-4 { padding: 1rem; }
      .space-y-2 > * + * { margin-top: 0.5rem; }
      .text-gray-300 { color: #d1d5db; }
      .text-gray-400 { color: #9ca3af; }
      .text-gray-500 { color: #6b7280; }
      .text-gray-600 { color: #4b5563; }
      .text-gray-700 { color: #374151; }
      .text-gray-800 { color: #1f2937; }
      .text-green-600 { color: #059669; }
      .text-green-700 { color: #047857; }
      .text-orange-700 { color: #c2410c; }
      .bg-white { background-color: #ffffff; }
      .bg-gray-50 { background-color: #f9fafb; }
      .bg-gray-100 { background-color: #f3f4f6;; }
      .leading-tight { line-height: 1.25; }
      .italic { font-style: italic; }
      .rounded-sm { border-radius: 0.125rem; }
      .border-2 { border-width: 2px; }
      .border-dashed { border-style: dashed; }
      .h-px { height: 1px; }
      .text-\\[9px\\] { font-size: 9px; }
      .text-\\[13px\\] { font-size: 13px; }
      .text-\\[14px\\] { font-size: 14px; }
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
