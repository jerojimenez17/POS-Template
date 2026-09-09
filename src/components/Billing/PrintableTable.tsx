"use client";
import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { BillContext } from "@/context/BillContext";
import Product from "@/models/Product";
import BillState from "@/models/BillState";
import DecimalInput from "./DecimalInput";
import InlineAmountInput from "./InlineAmountInput";
import ProductSearchBar from "./ProductSearchBar";
import { Session } from "next-auth";
import { cn } from "@/lib/utils";
import { Inter } from "next/font/google";
import { getBusinessBillingInfoAction } from "@/actions/business";
import moment from "moment";
import { QRCodeSVG } from "qrcode.react";
import { printThermalReceipt, exportToPDF, type ThermalReceiptData, buildPDFHTML, PDF_STYLES, type PrintOptions } from "@/lib/print";
import { formatInvoiceNumberFull, getBillTypeDisplay, normalizeBillType } from "@/lib/utils/bill-type";
import QRCode from "qrcode";
import CAE from "@/models/CAE";
import { buildReceiptBusinessInfo } from "@/lib/print/receipt-data";
import PriceEditInput from "./PriceEditInput";
import DiscountControl from "./DiscountControl";

interface Props {
  printTrigger: number;
  className: string;
  handleClose: () => void;
  session: Session | null;
  externalState?: BillState;
  printSnapshot?: BillState | null;
  forceCae?: CAE;
  targetWindowRef?: React.MutableRefObject<Window | null>;
}

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-inter",
});

const defaultBillState: BillState = {
  id: "",
  products: [],
  total: 0,
  totalWithDiscount: 0,
  seller: "",
  discount: 0,
  date: new Date(),
  typeDocument: "DNI",
  documentNumber: 0,
  IVACondition: "Consumidor Final",
  twoMethods: false,
};

const sortByDescription = (a: Product, b: Product) => {
  if (a.description < b.description) return -1;
  if (a.description > b.description) return 1;
  return 0;
};

const PrintableTable = ({
  printTrigger,
  session,
  className,
  externalState,
  printSnapshot,
  forceCae,
  targetWindowRef,
}: Props) => {
  const { BillState, addItem, removeItem, printMode, qzTrayEnabled } = React.useContext(BillContext);
  const [state, setState] = useState<BillState>(externalState || BillState || defaultBillState);
  const effectiveState: BillState = (printSnapshot ?? externalState ?? BillState ?? defaultBillState) as BillState;
  const effectiveCae: CAE | undefined = forceCae || effectiveState.CAE;
  const [isClient, setIsClient] = useState(false);
  const [billingInfo, setBillingInfo] = useState<{
    razonSocial?: string | null;
    cuit?: string | null;
    condicionIva?: string | null;
    inicioActividades?: Date | string | null;
    address?: string | null;
  } | null>(null);
  const [qrSvgDataUrl, setQrSvgDataUrl] = useState<string | null>(null);
  const [qrGenerationFailed, setQrGenerationFailed] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const lastPrintTrigger = useRef(0);

  // Fix hydration: Only run on client
  useEffect(() => {
    // This state gates client-only print markup after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsClient(true);

    const fetchBillingInfo = async () => {
      const info = await getBusinessBillingInfoAction();
      if (info) setBillingInfo(info);
    };
    fetchBillingInfo();
  }, []);

  useEffect(() => {
    let active = true;
    const activeCaeQr = effectiveCae;
    if (activeCaeQr?.qrData) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQrGenerationFailed(false);
      setQrSvgDataUrl(null);
      QRCode.toString(activeCaeQr.qrData, { type: "svg", margin: 0, width: 60 })
        .then((svgString) => {
          const dataUrl = `data:image/svg+xml;base64,${btoa(svgString)}`;
          if (active) setQrSvgDataUrl(dataUrl);
        })
        .catch((error: unknown) => {
          if (active) {
            setQrSvgDataUrl(null);
            setQrGenerationFailed(true);
          }
          console.error("Error generating receipt QR:", error);
        });
    } else {
      setQrSvgDataUrl(null);
      setQrGenerationFailed(false);
    }
    return () => { active = false; };
  }, [effectiveCae, effectiveCae?.qrData, forceCae]);

  const activeCae = effectiveCae;
  const bannerCae = effectiveState.CAE;
  const [displayBannerCae, setDisplayBannerCae] = useState<CAE | null>(null);
  const [isBannerExiting, setIsBannerExiting] = useState(false);

  useEffect(() => {
    const hasCae = !!bannerCae?.CAE?.trim();
    if (hasCae && bannerCae) {
      setDisplayBannerCae(bannerCae);
      setIsBannerExiting(false);
    } else if (!hasCae && displayBannerCae?.CAE) {
      setIsBannerExiting(true);
      const t = setTimeout(() => {
        setDisplayBannerCae(null);
        setIsBannerExiting(false);
      }, 300);
      return () => clearTimeout(t);
    }
  }, [bannerCae?.CAE, bannerCae?.qrData, bannerCae?.vencimiento, displayBannerCae?.CAE]);

  const receiptBusinessInfo = useMemo(
    () => buildReceiptBusinessInfo(
      session?.user?.businessName || "Mi Comercio",
      activeCae?.CAE,
      billingInfo ?? undefined,
      effectiveState.billType,
    ),
    [session?.user?.businessName, activeCae?.CAE, billingInfo, effectiveState.billType],
  );
  const isRemito = receiptBusinessInfo.documentKind === "remito";
  const isPresupuesto = normalizeBillType(effectiveState.billType) === "Presupuesto" || receiptBusinessInfo.documentKind === "presupuesto";
  const billTypeDisplay = getBillTypeDisplay(effectiveState.billType, activeCae?.CAE, isRemito);

  const handlePrint = useCallback(async () => {
    const activeCaePrint = forceCae || effectiveState.CAE;
    const subtotal = Math.round(effectiveState.products.reduce((sum, p) => sum + p.salePrice * p.amount, 0));
    const receiptData: ThermalReceiptData = {
      ...receiptBusinessInfo,
      date: effectiveState.date || new Date(),
      documentType: effectiveState.typeDocument || "DNI",
      billType: billTypeDisplay,
      seller: effectiveState.seller || session?.user?.email || "",
      paidMethod: effectiveState.paidMethod || "Efectivo",
      client: effectiveState.client,
      clientIvaCondition: effectiveState.clientIvaCondition,
      clientDocumentNumber: effectiveState.clientDocumentNumber,
      products: effectiveState.products.map((p) => ({
        description: p.description,
        amount: p.amount,
        unitPrice: p.salePrice,
        subtotal: Math.round(p.salePrice * p.amount),
      })),
      subtotal,
      discount: effectiveState.discount > 0 ? effectiveState.discount : undefined,
      discountAmount: effectiveState.discount > 0 ? Math.round(subtotal * (effectiveState.discount / 100)) : undefined,
      total: Math.round(Number(effectiveState.totalWithDiscount || subtotal * (1 - effectiveState.discount / 100))),
      cae: activeCaePrint?.CAE ? {
        cae: activeCaePrint.CAE,
        vencimiento: activeCaePrint.vencimiento,
        qrData: activeCaePrint.qrData,
        ptoVenta: activeCaePrint.ptoVenta ?? effectiveState.ptoVenta,
      } : undefined,
      pointOfSale: effectiveState.ptoVenta ?? activeCaePrint?.ptoVenta,
      invoiceNumber: activeCaePrint?.nroComprobante,
    };

    if (printMode === "thermal") {
         await printThermalReceipt(receiptData, qzTrayEnabled ?? false);
    } else {
      const content = document.createElement("div");
      content.innerHTML = buildPDFHTML(receiptData, {
        invoiceNumber: activeCaePrint?.nroComprobante,
        pointOfSale: effectiveState.ptoVenta ?? activeCaePrint?.ptoVenta,
        qrSvgDataUrl: qrSvgDataUrl,
      });

      const styleEl = document.createElement("style");
      styleEl.textContent = PDF_STYLES;
      content.insertBefore(styleEl, content.firstChild);

      document.body.appendChild(content);
      try {
        const filename = isPresupuesto
          ? `Presupuesto_${effectiveState.id || Date.now()}`
          : activeCaePrint?.CAE
            ? `Factura_${activeCaePrint?.nroComprobante || "000000000000"}`
            : `Comprobante_${effectiveState.id || Date.now()}`;

        await exportToPDF(content as HTMLElement, {
          documentTitle: filename,
          format: "a4",
          orientation: "portrait",
          margin: 10,
          filename: filename,
          targetWindow: targetWindowRef?.current || null,
        } as PrintOptions);
      } finally {
        document.body.removeChild(content);
      }
    }
  }, [effectiveState, session, printMode, billTypeDisplay, forceCae, qrSvgDataUrl, targetWindowRef, qzTrayEnabled, receiptBusinessInfo, isPresupuesto]);

  useEffect(() => {
    // Keep the externally supplied bill synchronized with the printable view.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(externalState || BillState || defaultBillState);
  }, [externalState, BillState]);

  useEffect(() => {
    if (printTrigger > lastPrintTrigger.current && isClient) {
      const activeCaeEff = effectiveCae;
      if (activeCaeEff?.qrData && !qrSvgDataUrl && !qrGenerationFailed) return;

      lastPrintTrigger.current = printTrigger;
      handlePrint();
    }
  }, [printTrigger, isClient, handlePrint, qrSvgDataUrl, qrGenerationFailed, forceCae, effectiveCae, effectiveCae?.qrData]);

  // Prevent browser defaults for F1/F2/F3 (Chrome opens help on F1)
  useEffect(() => {
    const preventFunctionKeys = (e: KeyboardEvent) => {
      if (["F1", "F2", "F3"].includes(e.key)) {
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", preventFunctionKeys, { capture: true });
    return () => window.removeEventListener("keydown", preventFunctionKeys, { capture: true });
  }, []);

  const handleProductAdd = useCallback((product: Product) => {
    addItem(product);
  }, [addItem]);

  const updateProductAmount = (productId: string, newAmount: number) => {
    const product = state.products.find((p) => p.id === productId);
    if (!product) return;

    const updatedProduct = { ...product, amount: newAmount };
    removeItem(product);
    addItem(updatedProduct);
  };

  const sortedProducts = useMemo(
    () => [...effectiveState.products].sort(sortByDescription),
    [effectiveState.products]
  );

  const totals = useMemo(() => {
    const subtotal = Math.round(effectiveState.products.reduce((sum, p) => sum + p.salePrice * p.amount, 0));
    const discountAmount = effectiveState.discount > 0 ? Math.round(subtotal * (effectiveState.discount / 100)) : 0;
    const total = effectiveState.discount > 0
      ? Math.round(subtotal * (1 - effectiveState.discount / 100))
      : effectiveState.totalWithDiscount !== undefined
        ? Math.round(Number(effectiveState.totalWithDiscount))
        : subtotal;
    return { subtotal, discountAmount, total };
  }, [effectiveState.products, effectiveState.discount, effectiveState.totalWithDiscount]);

  const hasSupplierFilter = session?.user?.business?.features?.hasSupplierFilter ?? false;
  const allowNegativeStock = session?.user?.business?.features?.hasNegativeStock ?? false;

  return (
    <div ref={contentRef} className={`${className} print:block print:bg-white overflow-visible`}>
      {/* Header - Print only */}
      {isClient && (
        <div className="print:block print:mb-4 mt-4 print:text-center hidden print:visible">
          <div className="flex flex-col items-center border-b pb-4 mb-4 border-gray-300">
            <h2
              className={cn(
                "text-3xl font-bold text-gray-800 tracking-tight uppercase",
                inter.className
              )}
            >
             {session?.user?.businessName || "Nombre de App"}
            </h2>
            {receiptBusinessInfo.documentKind === "official-invoice" && receiptBusinessInfo.businessInfo?.razonSocial && (
              <p className="text-sm text-gray-600 font-medium">
                {receiptBusinessInfo.businessInfo.razonSocial}
              </p>
            )}
          </div>

          <div className="mt-2 text-sm grid grid-cols-2 gap-4 text-left">
            <div>
              <p><span className="font-semibold">Fecha:</span> {new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(effectiveState.date || new Date())}</p>
               <p>
                <span className="font-semibold">
                  {receiptBusinessInfo.documentKind === "official-invoice" ? "Factura:" : "Comprobante:"}
                </span>{" "}
                 {billTypeDisplay}
               </p>
               {receiptBusinessInfo.documentKind === "official-invoice" &&
                 formatInvoiceNumberFull(activeCae?.nroComprobante, effectiveState.ptoVenta ?? activeCae?.ptoVenta) && (
                 <p><span className="font-semibold">N°:</span> {formatInvoiceNumberFull(activeCae?.nroComprobante, effectiveState.ptoVenta ?? activeCae?.ptoVenta)}</p>
               )}
              <p><span className="font-semibold">Vendedor:</span> {effectiveState.seller || session?.user?.email}</p>
              {!isPresupuesto && <p><span className="font-semibold">Medio de Pago:</span> {effectiveState.paidMethod}</p>}


                <div className="mt-3 text-xs border-t border-gray-200 pt-2">
                  <p><span className="font-semibold">Cliente:</span> {effectiveState.client}</p>
                  {effectiveState.clientIvaCondition && (
                    <p><span className="font-semibold">Condición IVA:</span> {effectiveState.clientIvaCondition.replace(/_/g, " ")}</p>
                  )}
                  {effectiveState.clientIvaCondition &&
                   effectiveState.clientIvaCondition.toLowerCase() !== "consumidor final" &&
                   effectiveState.clientIvaCondition.toLowerCase() !== "consumidor_final" &&
                   effectiveState.clientDocumentNumber && (
                    <p><span className="font-semibold">Documento:</span> {effectiveState.clientDocumentNumber}</p>
                  )}
                </div>

            </div>

             {receiptBusinessInfo.documentKind === "official-invoice" && receiptBusinessInfo.businessInfo && (
               <div>
                 {receiptBusinessInfo.businessInfo.cuit && <p><span className="font-semibold">CUIT:</span> {receiptBusinessInfo.businessInfo.cuit}</p>}
                 {receiptBusinessInfo.businessInfo.condicionIva && <p><span className="font-semibold">Condición IVA:</span> {receiptBusinessInfo.businessInfo.condicionIva.replace("_", " ")}</p>}
                 {receiptBusinessInfo.businessInfo.inicioActividades && <p><span className="font-semibold">Inicio Actividades:</span> {moment(receiptBusinessInfo.businessInfo.inicioActividades).format("DD/MM/YYYY")}</p>}
                 {receiptBusinessInfo.businessInfo.address && <p><span className="font-semibold">Dirección:</span> {receiptBusinessInfo.businessInfo.address}</p>}
              </div>
            )}
          </div>
        </div>
      )}

      <ProductSearchBar
        onProductAdd={handleProductAdd}
        hasSupplierFilter={hasSupplierFilter}
        allowNegativeStock={allowNegativeStock}
      />

      {/* Products Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700/50 text-left text-sm font-medium text-gray-500 dark:text-gray-400">
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3 text-center">Cantidad</th>
                <th className="px-4 py-3 text-right">Precio</th>
                <th className="px-4 py-3 text-right">Subtotal</th>
                <th className="px-4 py-3 w-12 print:hidden"></th>
              </tr>
            </thead>
            <tbody>
              {sortedProducts.map((product) => (
                <tr
                  key={product.id}
                  className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 dark:text-gray-100">{product.description}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">{product.code}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2 print:hidden" style={{ touchAction: "manipulation" }}>
                      {["unidades", "unidad"].includes(product.unit.toLowerCase()) ? (
                        <>
                          <button
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-gray-600 dark:text-gray-300"
                            onClick={() => updateProductAmount(product.id, product.amount - 1)}
                            aria-label="Disminuir cantidad"
                          >
                            −
                          </button>
                          <InlineAmountInput
                            amount={product.amount}
                            productId={product.id}
                            updateAmount={updateProductAmount}
                          />
                          <button
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-gray-600 dark:text-gray-300"
                            onClick={() => updateProductAmount(product.id, product.amount + 1)}
                            aria-label="Aumentar cantidad"
                          >
                            +
                          </button>
                        </>
                      ) : (
                        <DecimalInput
                          initial={product.amount}
                          product={product}
                          updateAmount={updateProductAmount}
                        />
                      )}
                    </div>
                    <div className="hidden print:block text-center font-medium tabular-nums">
                      {product.amount}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">
                    <PriceEditInput
                      productId={product.id}
                      salePrice={product.salePrice}
                    />
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    ${Math.round(product.salePrice * product.amount).toLocaleString("es-AR", {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    })}
                  </td>
                  <td className="px-4 py-3 print:hidden">
                    <button
                      onClick={() => removeItem(product)}
                      className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors"
                      aria-label={`Eliminar ${product.description}`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18"/>
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
              {sortedProducts.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-gray-400">
                    <div className="flex flex-col items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-50">
                        <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/>
                        <path d="M3 6h18"/>
                        <path d="M16 10a4 4 0 0 1-8 0"/>
                      </svg>
                      <p>No hay productos agregados</p>
                      <p className="text-sm">Buscá un producto para comenzar</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Totals Section */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-700/30">
          <div className="flex justify-end">
            <div className="w-72 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Subtotal</span>
                <span className="font-medium tabular-nums">
                  ${totals.subtotal.toLocaleString("es-AR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>

              <div className="print:hidden">
                <DiscountControl editable={!externalState} />
              </div>

              {effectiveState.discount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Descuento ({effectiveState.discount}%)</span>
                  <span className="font-medium text-green-600 dark:text-green-400 tabular-nums">
                    -${totals.discountAmount.toLocaleString("es-AR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              )}

              <div className="flex justify-between text-lg font-bold border-t border-gray-300 dark:border-gray-600 pt-2">
                <span>Total</span>
                <span className="tabular-nums">
                  ${totals.total.toLocaleString("es-AR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isClient && receiptBusinessInfo.documentKind === "official-invoice" && displayBannerCae?.CAE && (
        <div
          className={cn(
            "mt-8 text-xs border-t border-gray-300 pt-4 pb-8 overflow-hidden transition-all duration-300 ease-in-out print-visible",
            isBannerExiting ? "max-h-0 opacity-0 -translate-y-2 pt-0 pb-0 border-transparent" : "max-h-[400px] opacity-100 translate-y-0"
          )}
          aria-hidden={isBannerExiting}
        >
          <div className="flex items-center justify-between gap-4">
            {displayBannerCae.qrData ? (
              <div className="shrink-0 bg-white p-1 rounded-sm">
                <QRCodeSVG value={displayBannerCae.qrData} size={110} level="M" includeMargin={false} />
              </div>
            ) : (
              <div className="w-[110px] shrink-0"></div>
            )}

            <div className="flex-1 text-center">
              <p className="font-bold text-[14px] mb-2 uppercase tracking-wide">Comprobante Autorizado</p>
              <p className="mb-1">
                  <span className="font-bold text-gray-700">CAE:</span> <span className="text-[13px]">{displayBannerCae.CAE}</span>
              </p>
              <p className="mb-3">
                <span className="font-bold text-gray-700">Vencimiento:</span> <span className="text-[13px]">{displayBannerCae.vencimiento}</span>
              </p>
              <div className="w-full h-px bg-gray-200 my-2 mx-auto max-w-[200px]"></div>
              <p className="text-[9px] leading-tight italic text-gray-500 max-w-[300px] mx-auto">
                El crédito fiscal discriminado en el presente comprobante, sólo
                podrá ser computado a efectos del Régimen de Sostenimiento e
                Inclusión Fiscal para Pequeños Contribuyentes de la Ley N°27.618
              </p>
            </div>

            <div className="w-[110px] shrink-0 flex flex-col items-center justify-center opacity-60">
               <div className="h-10 w-24 border-2 border-gray-300 border-dashed rounded flex flex-col items-center justify-center text-gray-400">
                  <span className="text-[8px] font-bold">AFIP</span>
               </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PrintableTable;
