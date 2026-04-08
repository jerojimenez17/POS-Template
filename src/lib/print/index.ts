export {
  printElement,
  printThermalReceipt,
  generateThermalReceipt,
  ESCPOS,
  type BrowserPrintOptions,
  type PrintOptions,
  type ThermalReceiptData,
} from "./BrowserPrint";

export {
  exportToPDF,
  downloadPDF,
  downloadElementAsPDF,
  captureElement,
} from "./PDFExport";

export {
  getBillTypeDisplay,
  isAFIPAuthorized,
  getShortBillType,
  formatInvoiceNumberFull,
  AFIP_INVOICE_TYPES,
} from "@/lib/utils/bill-type";

export {
  PDF_STYLES,
  buildPDFHTML,
  type PDFTemplateOptions,
} from "./pdf-templates";
