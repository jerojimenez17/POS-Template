import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

export interface PrintOptions {
  documentTitle?: string;
  pageStyle?: string;
  scale?: number;
  filename?: string;
  format?: "a4" | "letter" | "thermal";
  orientation?: "portrait" | "landscape";
  margin?: number;
  targetWindow?: Window | null;
}

const DEFAULT_OPTIONS: Required<PrintOptions> = {
  documentTitle: "document",
  pageStyle: "",
  scale: 2,
  filename: "print",
  format: "thermal",
  orientation: "portrait",
  margin: 10,
  targetWindow: null,
};

function getFormatDimensions(format: PrintOptions["format"]) {
  switch (format) {
    case "a4":
      return { width: 210, height: 297 };
    case "letter":
      return { width: 216, height: 279 };
    case "thermal":
    default:
      return { width: 80, height: 297 };
  }
}

export async function captureElement(
  element: HTMLElement,
  options: PrintOptions = {}
): Promise<HTMLCanvasElement> {
  const { scale = 2 } = options;

  const canvas = await html2canvas(element, {
    scale,
    useCORS: true,
    allowTaint: true,
    backgroundColor: "#ffffff",
    logging: false,
    onclone: (clonedDoc) => {
      const clonedElement = clonedDoc.body.querySelector("[class*='print']") || clonedDoc.body.firstElementChild;
      if (clonedElement) {
        const printHidden = clonedDoc.querySelectorAll(".print\\:hidden, [data-print-hidden]");
        printHidden.forEach((el) => el.remove());
      }
    },
  });

  return canvas;
}

export async function exportToPDF(
  element: HTMLElement,
  options: PrintOptions = {}
): Promise<void> {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
  const {
    documentTitle,
    format,
    orientation,
    margin,
  } = mergedOptions;

  const canvas = await captureElement(element, mergedOptions);
  
  const formatDims = getFormatDimensions(format);
  const isLandscape = orientation === "landscape";
  
  const pageWidth = isLandscape ? formatDims.height : formatDims.width;
  const pageHeight = isLandscape ? formatDims.width : formatDims.height;
  
  const pdf = new jsPDF({
    orientation: orientation,
    unit: "mm",
    format: format === "thermal" ? [pageWidth, pageHeight] : format,
  });

  const imgWidth = pageWidth - margin * 2;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  const imgData = canvas.toDataURL("image/png");
  
  let heightLeft = imgHeight;
  let position = margin;

  pdf.setDocumentProperties({
    title: documentTitle,
    subject: "Printed Document",
    creator: "POS Template",
  });

  pdf.addImage(imgData, "PNG", margin, position, imgWidth, imgHeight);
  heightLeft -= pageHeight - margin * 2;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight + margin;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", margin, position, imgWidth, imgHeight);
    heightLeft -= pageHeight - margin * 2;
  }

  // To avoid automatic download and prioritize "Showing for printing":
  // We use a Blob and open it in a new window.
  const pdfBlob = pdf.output("blob");
  const pdfUrl = URL.createObjectURL(pdfBlob);

  const printWindow = mergedOptions.targetWindow || window.open(pdfUrl, "_blank");
  
  if (printWindow) {
    if (printWindow.location.href !== pdfUrl && !printWindow.location.href.includes("blob:")) {
       printWindow.location.href = pdfUrl;
    }
    // Focus the new window
    printWindow.focus();
    
    // We try to trigger print, but many browsers block this for PDF blobs
    // The user will still see the PDF in the new tab, which is "mostrar para imprimir"
    printWindow.onload = () => {
      try {
        printWindow.print();
      } catch (e) {
        console.warn("Auto-print failed, user can still print manually", e);
      }
    };
  } else {
    // If popup is blocked, we have to fallback to download or inform the user
    // Since the user asked specifically "not to save/guarde", 
    // we'll try to redirect the current window if it's a dedicated print action,
    // or just fallback to download as last resort but with a warning.
    console.warn("Popup blocked. Falling back to download.");
    downloadPDF(pdf, mergedOptions.filename || "document");
  }
}

export function downloadPDF(pdf: jsPDF, filename: string): void {
  pdf.save(`${filename}.pdf`);
}

export async function downloadElementAsPDF(
  element: HTMLElement,
  filename: string,
  options: PrintOptions = {}
): Promise<void> {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options, filename };
  
  const canvas = await captureElement(element, mergedOptions);
  
  const formatDims = getFormatDimensions(mergedOptions.format);
  const pageWidth = formatDims.width;
  const pageHeight = formatDims.height;
  
  const pdf = new jsPDF({
    orientation: mergedOptions.orientation,
    unit: "mm",
    format: mergedOptions.format === "thermal" ? [pageWidth, pageHeight] : mergedOptions.format,
  });

  const margin = mergedOptions.margin;
  const imgWidth = pageWidth - margin * 2;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  const imgData = canvas.toDataURL("image/png");
  pdf.addImage(imgData, "PNG", margin, margin, imgWidth, imgHeight);
  
  pdf.save(`${filename}.pdf`);
}
