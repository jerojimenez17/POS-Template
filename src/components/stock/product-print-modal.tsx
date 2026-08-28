"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { printElement } from "@/lib/print";
import { ProductExtended } from "./product-form";

export type ProductPrintFormat = "a4" | "thermal" | "label-45x55";
type PrintOrientation = "portrait" | "landscape";
type A4Span = 1 | 2;
type ProductPrintVariant = ProductExtended & { a4Width?: "double" };
type TagState = { hasBarcode: boolean; showPrice: boolean; index: number; total: number; a4Span: A4Span };

interface PrintTag {
  product: ProductExtended;
  key: string;
  index: number;
  a4Span: A4Span;
}

interface ProductPrintLayout {
  kind: "a4" | "thermal" | "label";
  tagsPerPage: number;
  editableDescription: boolean;
  editablePrice: boolean;
  getDescriptionClassName: () => string;
  getPriceClassName: (state: TagState) => string;
  getCodeClassName: (state: TagState) => string;
  getTagClassName: (state: TagState) => string;
  getTagStyle: (state: TagState) => React.CSSProperties;
}

export interface ProductPrintFormatConfig {
  width: string;
  height: string;
  pageSize: string;
  orientation: PrintOrientation | undefined;
  pageStyle: string;
  printFormat: "a4" | "thermal";
  layout: ProductPrintLayout;
  barcode: { width: (showPrice: boolean) => number; height: number };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: ProductExtended[];
  format?: ProductPrintFormat;
}

function formatPrice(price: number): string {
  return `$${Math.round(price / 10) * 10}`;
}

const TAG_WIDTH = "6.3cm";
const A4_TAG_WIDTH = "6.5cm";
const A4_DOUBLE_TAG_WIDTH = "13.2cm";
const TAG_HEIGHT_WITH_BARCODE = "3.2cm";
const TAG_HEIGHT_WITHOUT_BARCODE = "2.8cm";
const TAG_HEIGHT_WITHOUT_BARCODE_A4 = "4.5cm";

const A4_PAGE_STYLE = `@page { size: A4; margin: 5mm; }
@media print {
  body { -webkit-print-color-adjust: exact; margin: 0; padding: 0; }
  .no-print { display: none !important; }
  .label-container { overflow: visible !important; min-height: 3.2cm; }
  .label-description { font-size: 14px; font-weight: 700; text-align: center; line-height: 1.3; margin-bottom: 4px; word-wrap: break-word; overflow-wrap: anywhere; width: 100%; }
  .label-price { font-size: 18px; font-weight: 700; text-align: center; margin-bottom: 2px; }
  .label-barcode { text-align: center; margin: 4px 0px; }
  .label-container.has-barcode .label-barcode { margin: 4px -6px; }
  .label-code { font-size: 10px; text-align: center; margin-top: 2px; }
  .no-barcode { justify-content: space-between !important; }
  .no-barcode .label-code { font-size: 8px; }
  .no-barcode:not(.has-price) .label-description { font-size: 20px; font-weight: 900; }
  .no-barcode.has-price .label-description { font-size: 20px; font-weight: 600; }
  .no-barcode.has-price .label-price { font-size: 72px; font-weight: 900; max-width: 100%; overflow-wrap: anywhere; white-space: normal; }
  .no-barcode.has-price .price-symbol { font-size: 0.55em; vertical-align: baseline; }
  .label-container.no-barcode { border-style: solid !important; }
}`;

const THERMAL_PAGE_STYLE = `@page { size: 55mm 65mm; margin: 0; }
@media print {
  body { -webkit-print-color-adjust: exact; margin: 0; padding: 0; }
  .no-print { display: none !important; }
  .label-description { font-size: 14px; font-weight: 700; text-align: center; line-height: 1.3; margin-bottom: 4px; word-wrap: break-word; width: 100%; }
  .label-price { font-size: 20px; font-weight: 700; text-align: center; margin-bottom: 2px; }
  .label-barcode { text-align: center; margin: 4px 0px; }
  .label-code { font-size: 10px; text-align: center; margin-top: 2px; }
  .no-barcode { justify-content: space-between !important; }
  .no-barcode .label-code { font-size: 8px; }
  .no-barcode:not(.has-price) .label-description { font-size: 20px; font-weight: 900; }
  .no-barcode.has-price .label-description { font-size: 12px; font-weight: 600; }
  .no-barcode.has-price .label-price { font-size: 36px; font-weight: 900; }
}`;

export const LABEL_55X45_WIDTH = "55mm";
export const LABEL_55X45_HEIGHT = "45mm";

export const LABEL_45X55_PAGE_STYLE = `@page { size: 55mm 45mm landscape; margin: 0; }
html, body { width: 55mm; height: 45mm; margin: 0; padding: 0; }
@media print {
  html, body { width: 55mm; height: 45mm; margin: 0; padding: 0; }
  body { color: #000; background: #fff; -webkit-print-color-adjust: exact; }
  .no-print { display: none !important; }
  .label-container { width: 55mm !important; height: 45mm !important; box-sizing: border-box; overflow: hidden; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2mm; color: #000; background: #fff; page-break-inside: avoid; max-width: 100%; }
  .label-container:not(:last-child) { page-break-after: always; break-after: page; }
  .label-description { max-width: 100%; width: 100%; overflow-wrap: anywhere; word-wrap: break-word; text-align: center; }
  .label-barcode { min-width: 0; max-width: 100%; width: 100%; overflow: hidden; }
  .label-barcode svg { display: block; min-width: 0; max-width: 100%; width: 100%; height: auto; }
}`;

export const PRODUCT_PRINT_FORMAT_CONFIG: Record<ProductPrintFormat, ProductPrintFormatConfig> = {
  a4: {
    width: A4_TAG_WIDTH, height: TAG_HEIGHT_WITHOUT_BARCODE, pageSize: "A4", orientation: undefined,
    pageStyle: A4_PAGE_STYLE, printFormat: "a4", barcode: { width: (price) => price ? 3 : 1.5, height: 40 },
    layout: {
      kind: "a4", tagsPerPage: 13,
      editableDescription: true, editablePrice: true,
      getDescriptionClassName: () => "label-description outline-none focus:bg-blue-50 dark:focus:bg-gray-800 rounded px-1 transition-colors text-[20px] font-semibold overflow-wrap-anywhere",
      getPriceClassName: ({ hasBarcode }) => `label-price outline-none focus:bg-blue-50 dark:focus:bg-gray-800 rounded px-1 transition-colors font-bold ${hasBarcode ? "text-lg" : "text-[72px]"}`,
      getCodeClassName: ({ hasBarcode }) => `label-code text-center ${!hasBarcode ? "text-[8px]" : "text-[10px]"}`,
      getTagClassName: ({ hasBarcode, showPrice }) => `flex flex-col text-black items-center border border-dashed border-gray-300 rounded p-2 bg-white label-container ${!hasBarcode ? "no-barcode justify-between" : "has-barcode"} ${showPrice ? "has-price" : ""}`,
      getTagStyle: ({ hasBarcode, showPrice, a4Span }) => ({ width: a4Span === 2 ? A4_DOUBLE_TAG_WIDTH : A4_TAG_WIDTH, gridColumn: a4Span === 2 ? "span 2" : undefined, minHeight: hasBarcode && showPrice ? TAG_HEIGHT_WITHOUT_BARCODE : hasBarcode ? TAG_HEIGHT_WITH_BARCODE : TAG_HEIGHT_WITHOUT_BARCODE_A4 }),
    },
  },
  thermal: {
    width: TAG_WIDTH, height: TAG_HEIGHT_WITHOUT_BARCODE, pageSize: "55mm 65mm", orientation: undefined,
    pageStyle: THERMAL_PAGE_STYLE, printFormat: "thermal", barcode: { width: (price) => price ? 1.8 : 2.5, height: 48 },
    layout: {
      kind: "thermal", tagsPerPage: 1,
      editableDescription: true, editablePrice: true,
      getDescriptionClassName: () => "label-description text-sm font-semibold",
      getPriceClassName: ({ hasBarcode }) => `label-price outline-none focus:bg-blue-50 dark:focus:bg-gray-800 rounded px-1 transition-colors font-bold ${hasBarcode ? "text-xl" : "text-3xl"}`,
      getCodeClassName: ({ hasBarcode }) => `label-code text-center ${!hasBarcode ? "text-[8px]" : "text-[10px]"}`,
      getTagClassName: ({ hasBarcode, showPrice }) => `flex flex-col text-black items-center border border-dashed border-gray-300 rounded p-2 bg-white ${!hasBarcode ? "no-barcode justify-between" : ""} ${showPrice ? "has-price" : ""} ${hasBarcode && !showPrice ? "justify-center flex-1" : ""}`,
      getTagStyle: ({ hasBarcode, showPrice }) => ({ width: hasBarcode && !showPrice ? "55mm" : TAG_WIDTH, height: !hasBarcode ? TAG_HEIGHT_WITHOUT_BARCODE : showPrice ? undefined : "65mm" }),
    },
  },
  "label-45x55": {
    width: LABEL_55X45_WIDTH, height: LABEL_55X45_HEIGHT, pageSize: "55mm 45mm", orientation: "landscape",
    pageStyle: LABEL_45X55_PAGE_STYLE, printFormat: "thermal", barcode: { width: (price) => price ? 1.8 : 2.5, height: 48 },
    layout: {
      kind: "label", tagsPerPage: 1,
      editableDescription: true, editablePrice: false,
      getDescriptionClassName: () => "label-description text-sm font-semibold",
      getPriceClassName: () => "label-price font-bold",
      getCodeClassName: () => "label-code text-center text-[10px]",
      getTagClassName: ({ hasBarcode, showPrice }) => `label-container flex flex-col text-black items-center border border-dashed border-gray-300 rounded p-2 bg-white ${!hasBarcode ? "no-barcode" : "has-barcode"} ${showPrice ? "has-price" : ""}`,
      getTagStyle: ({ index, total }) => ({ width: LABEL_55X45_WIDTH, height: LABEL_55X45_HEIGHT, boxSizing: "border-box", padding: "2mm", overflow: "hidden", ...(index < total - 1 ? { pageBreakAfter: "always" } : {}) }),
    },
  },
};

const ProductPrintModal = ({ open, onOpenChange, products, format = "a4" }: Props) => {
  const [paperSize, setPaperSize] = useState<ProductPrintFormat>(format);
  const config = PRODUCT_PRINT_FORMAT_CONFIG[paperSize];
  const barcodeRefs = useRef<(SVGSVGElement | null)[]>([]);
  const printRef = useRef<HTMLDivElement>(null);
  const [copies, setCopies] = useState(1);
  const [showPrice, setShowPrice] = useState(true);
  const [showBarcode, setShowBarcode] = useState(false);
  const [key, setKey] = useState(0);
  const allTags: PrintTag[] = products.flatMap((product, productIndex) => Array.from({ length: copies }, (_, copyIndex) => {
    const variant = product as ProductPrintVariant;
    const a4Span: A4Span = paperSize === "a4" && (variant.a4Width === "double" || formatPrice(product.salePrice).length >= 6) ? 2 : 1;
    return { product, key: `${product.id}-${copyIndex}`, index: productIndex * copies + copyIndex, a4Span };
  }));

  const pages: PrintTag[][] = [];
  if (config.layout.kind === "a4") {
    let currentPage: PrintTag[] = [];
    let rowTracks = 0;
    let rowCount = 0;

    allTags.forEach((tag) => {
      const fitsCurrentRow = rowTracks > 0 && rowTracks + tag.a4Span <= 3;
      const requiresNewRow = !fitsCurrentRow;
      const requiredRows = rowCount + (requiresNewRow ? 1 : 0);

      // Reserve the complete physical footprint before inserting the tag.
      // Each row has three tracks; a double tag consumes two tracks but still
      // occupies exactly one physical row.
      if (currentPage.length >= config.layout.tagsPerPage || requiredRows > 6) {
        if (currentPage.length > 0) pages.push(currentPage);
        currentPage = [];
        rowTracks = 0;
        rowCount = 0;
      }

      currentPage.push(tag);
      if (requiresNewRow || rowTracks === 0) {
        rowCount += 1;
        rowTracks = tag.a4Span;
      } else {
        rowTracks += tag.a4Span;
      }
    });

    if (currentPage.length > 0) pages.push(currentPage);
  } else {
    for (let index = 0; index < allTags.length; index += config.layout.tagsPerPage) {
      pages.push(allTags.slice(index, index + config.layout.tagsPerPage));
    }
  }

  const generateBarcodes = useCallback(() => {
    let index = 0;
    products.forEach((product) => { for (let copy = 0; copy < copies; copy += 1) {
      const element = barcodeRefs.current[index];
      const value = product.codebar || product.code;
      if (element && value) JsBarcode(element, value, { format: "CODE128", lineColor: "#000000", width: config.barcode.width(showPrice), height: config.barcode.height, displayValue: true, fontSize: 10, margin: 0 });
      index += 1;
    }});
  }, [config, copies, products, showPrice]);

  useEffect(() => { generateBarcodes(); }, [generateBarcodes, key]);

  const handlePrint = async () => {
    if (!printRef.current) return;
    await printElement(printRef.current, {
      documentTitle: `Etiquetas_${new Date().toISOString().split("T")[0]}`,
      pageStyle: config.pageStyle, format: config.printFormat,
      ...(config.orientation ? { orientation: config.orientation } : {}),
    });
  };

  const renderTag = (tag: (typeof allTags)[number], index: number) => {
    const hasBarcode = showBarcode && Boolean(tag.product.codebar || tag.product.code);
    const state: TagState = { hasBarcode, showPrice, index, total: allTags.length, a4Span: tag.a4Span };
    const price = formatPrice(tag.product.salePrice);
    const description = <div className={config.layout.getDescriptionClassName()} contentEditable={config.layout.editableDescription} suppressContentEditableWarning spellCheck={false} title={config.layout.editableDescription ? "Haz clic para editar la descripción antes de imprimir" : undefined}>{tag.product.description}</div>;
    const priceElement = showPrice && <div className={config.layout.getPriceClassName(state)} contentEditable={config.layout.editablePrice} suppressContentEditableWarning spellCheck={false} title={config.layout.editablePrice ? "Haz clic para editar el precio antes de imprimir" : undefined}>{config.layout.kind === "a4" ? <><span className="price-symbol">$</span><span className="price-amount">{price.slice(1)}</span></> : price}</div>;
    const code = (config.layout.kind !== "a4" || hasBarcode) && <div className={config.layout.getCodeClassName(state)}>{tag.product.code}</div>;
    const barcode = hasBarcode && <div className="label-barcode"><svg ref={(element) => { barcodeRefs.current[index] = element; }} className="w-full" /></div>;
    return <div key={tag.key} className={config.layout.getTagClassName(state)} style={config.layout.getTagStyle(state)}>{description}{priceElement}{code}{barcode}</div>;
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="w-full max-w-2xl"><DialogHeader><DialogTitle>Imprimir Etiquetas</DialogTitle></DialogHeader>
      <div className="flex items-center gap-4 py-4"><div className="flex flex-col gap-2"><Label htmlFor="copies">Copias por producto</Label><Input id="copies" type="number" min={1} max={50} value={copies} onChange={(event) => { const value = parseInt(event.target.value, 10); if (!Number.isNaN(value)) setCopies(Math.max(1, Math.min(50, value))); }} className="w-24" /></div>
        <div className="flex flex-col gap-2"><Label htmlFor="paper-size">Tamaño de papel</Label><Select value={paperSize} onValueChange={(value) => { if (value in PRODUCT_PRINT_FORMAT_CONFIG) setPaperSize(value as ProductPrintFormat); }}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="a4">Hoja A4</SelectItem><SelectItem value="thermal">Etiqueta (55×65mm)</SelectItem><SelectItem value="label-45x55">Etiqueta (55 × 45 mm)</SelectItem></SelectContent></Select></div>
        <div className="flex items-center gap-2 mt-5"><Checkbox id="show-price" checked={showPrice} onCheckedChange={(checked) => setShowPrice(Boolean(checked))} /><Label htmlFor="show-price" className="cursor-pointer">Mostrar precio</Label></div>
        <Button variant="outline" onClick={() => { setShowBarcode((value) => !value); setKey((value) => value + 1); }} className="mt-5">{showBarcode ? "Quitar" : "Generar"}</Button></div>
       <div className="no-print border rounded-md p-4 bg-slate-50 max-h-96 overflow-y-auto"><div ref={printRef}>{config.layout.kind === "a4" ? pages.map((page, pageIndex) => <div key={pageIndex} style={pageIndex < pages.length - 1 ? { pageBreakAfter: "always" } : undefined}><div style={{ display: "grid", gridTemplateColumns: `repeat(3, ${config.width})`, gap: "2mm", justifyContent: "center" }}>{page.map((tag) => renderTag(tag, tag.index))}</div></div>) : allTags.map((tag) => renderTag(tag, tag.index))}</div></div>
      {config.layout.kind === "label" && <p className="no-print text-sm text-muted-foreground">En la impresión seleccioná escala 100%, márgenes ninguno y orientación horizontal (landscape). Las preferencias del navegador o driver pueden prevalecer.</p>}
      <DialogFooter><Button type="submit" className="text-xl" onClick={handlePrint}>Imprimir</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
};

export default ProductPrintModal;
