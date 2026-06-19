"use client";
import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { BillContext } from "@/context/BillContext";
import Product from "@/models/Product";
import BillState from "@/models/BillState";
import DecimalInput from "./DecimalInput";
import ProductSearchBar from "./ProductSearchBar";
import { Session } from "next-auth";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Inter } from "next/font/google";
import { getBusinessBillingInfoAction } from "@/actions/business";
import moment from "moment";
import { QRCodeSVG } from "qrcode.react";
import { printThermalReceipt, exportToPDF, type ThermalReceiptData, buildPDFHTML, PDF_STYLES, type PrintOptions } from "@/lib/print";
import { getBillTypeDisplay } from "@/lib/utils/bill-type";
import { Trash2 } from "lucide-react";
import QRCode from "qrcode";
import CAE from "@/models/CAE";

interface Props {
  printTrigger: number;
  className: string;
  handleClose: () => void;
  session: Session | null;
  externalState?: BillState;
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
  forceCae,
  targetWindowRef,
}: Props) => {
  const { BillState, addItem, removeItem, printMode, qzTrayActive } = React.useContext(BillContext);
  const [state, setState] = useState<BillState>(externalState || BillState || defaultBillState);
  const [isClient, setIsClient] = useState(false);
  const [billingInfo, setBillingInfo] = useState<{
    razonSocial?: string | null;
    cuit?: string | null;
    condicionIva?: string | null;
    inicioActividades?: Date | string | null;
    address?: string | null;
  } | null>(null);
  const [qrSvgDataUrl, setQrSvgDataUrl] = useState<string | null>(null);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const contentRef = useRef<HTMLDivElement>(null);
  const lastPrintTrigger = useRef(0);

  // Fix hydration: Only run on client
  useEffect(() => {
    setIsClient(true);

    const fetchBillingInfo = async () => {
      const info = await getBusinessBillingInfoAction();
      if (info) setBillingInfo(info);
    };
    fetchBillingInfo();
  }, []);

  useEffect(() => {
    const activeCae = forceCae || state.CAE;
    if (activeCae?.qrData) {
      QRCode.toString(activeCae.qrData, { type: "svg", margin: 0, width: 60 })
        .then((svgString) => {
          const dataUrl = `data:image/svg+xml;base64,${btoa(svgString)}`;
          setQrSvgDataUrl(dataUrl);
        })
        .catch(console.error);
    } else {
      setQrSvgDataUrl(null);
    }
  }, [state.CAE, state.CAE?.qrData, forceCae]);

  const isRemito = !(forceCae || state.CAE)?.CAE || (forceCae || state.CAE)?.CAE === "";
  const billTypeDisplay = getBillTypeDisplay(state.billType, (forceCae || state.CAE)?.CAE, isRemito);

  const handlePrint = useCallback(async () => {
    const activeCae = forceCae || state.CAE;
    const subtotal = state.products.reduce((sum, p) => sum + p.salePrice * p.amount, 0);
    const receiptData: ThermalReceiptData = {
      businessName: session?.user?.businessName || "Mi Comercio",
      businessInfo: billingInfo ? {
        razonSocial: billingInfo.razonSocial,
        cuit: billingInfo.cuit,
        condicionIva: billingInfo.condicionIva,
        address: billingInfo.address,
      } : undefined,
      date: state.date || new Date(),
      documentType: state.typeDocument || "DNI",
      billType: billTypeDisplay,
      seller: state.seller || session?.user?.email || "",
      paidMethod: state.paidMethod || "Efectivo",
      client: state.client,
      clientIvaCondition: state.clientIvaCondition,
      clientDocumentNumber: state.clientDocumentNumber,
      products: state.products.map((p) => ({
        description: p.description,
        amount: p.amount,
        unitPrice: p.salePrice,
        subtotal: p.salePrice * p.amount,
      })),
      subtotal,
      discount: state.discount > 0 ? state.discount : undefined,
      discountAmount: state.discount > 0 ? subtotal * (state.discount / 100) : undefined,
      total: state.totalWithDiscount || subtotal * (1 - state.discount / 100),
      cae: activeCae?.CAE ? {
        cae: activeCae.CAE,
        vencimiento: activeCae.vencimiento,
        qrData: activeCae.qrData,
      } : undefined,
    };

    if (printMode === "thermal") {
      await printThermalReceipt(receiptData, qzTrayActive);
    } else {
      const content = document.createElement("div");
      content.innerHTML = buildPDFHTML(receiptData, {
        invoiceNumber: activeCae?.nroComprobante,
        qrSvgDataUrl: qrSvgDataUrl,
      });

      const styleEl = document.createElement("style");
      styleEl.textContent = PDF_STYLES;
      content.insertBefore(styleEl, content.firstChild);

      document.body.appendChild(content);
      try {
        const filename = activeCae?.CAE
          ? `Factura_${activeCae?.nroComprobante || "000000000000"}`
          : `Comprobante_${state.id || Date.now()}`;

        await exportToPDF(content as HTMLElement, {
          documentTitle: filename,
          format: "a4",
          filename: filename,
          targetWindow: targetWindowRef?.current || null,
        } as PrintOptions);
      } finally {
        document.body.removeChild(content);
      }
    }
  }, [state, session, billingInfo, printMode, billTypeDisplay, forceCae, qrSvgDataUrl, targetWindowRef]);

  useEffect(() => {
    setState(externalState || BillState || defaultBillState);
  }, [externalState, BillState]);

  useEffect(() => {
    if (printTrigger > lastPrintTrigger.current && isClient) {
      const activeCae = forceCae || state.CAE;
      if (activeCae?.qrData && !qrSvgDataUrl) return;

      lastPrintTrigger.current = printTrigger;
      handlePrint();
    }
  }, [printTrigger, isClient, handlePrint, qrSvgDataUrl, forceCae, state.CAE, state.CAE?.qrData]);

  const handleProductAdd = useCallback((product: Product) => {
    if (product.amount <= 0) {
      toast.error("Cantidad corregida a 1 (mínimo permitido)");
      addItem({ ...product, amount: 1 });
      return;
    }
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
    () => [...state.products].sort(sortByDescription),
    [state.products]
  );

  const totals = useMemo(() => {
    const subtotal = state.products.reduce((sum, p) => sum + p.salePrice * p.amount, 0);
    const discountAmount = state.discount > 0 ? subtotal * (state.discount / 100) : 0;
    const total = state.totalWithDiscount || subtotal * (1 - state.discount / 100);
    return { subtotal, discountAmount, total };
  }, [state.products, state.discount, state.totalWithDiscount]);

  const hasSupplierFilter = session?.user?.business?.features?.hasSupplierFilter ?? false;

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
            {billingInfo?.razonSocial && (
              <p className="text-sm text-gray-600 font-medium">
                {billingInfo.razonSocial}
              </p>
            )}
          </div>

          <div className="mt-2 text-sm grid grid-cols-2 gap-4 text-left">
            <div>
              <p><span className="font-semibold">Fecha:</span> {new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(state.date || new Date())}</p>
              <p>
                <span className="font-semibold">
                  {state.CAE?.CAE ? "Factura:" : "Comprobante:"}
                </span>{" "}
                {billTypeDisplay}
              </p>
              <p><span className="font-semibold">Vendedor:</span> {state.seller || session?.user?.email}</p>
              <p><span className="font-semibold">Medio de Pago:</span> {state.paidMethod}</p>


                <div className="mt-3 text-xs border-t border-gray-200 pt-2">
                  <p><span className="font-semibold">Cliente:</span> {state.client}</p>
                  {state.clientIvaCondition && (
                    <p><span className="font-semibold">Condición IVA:</span> {state.clientIvaCondition.replace(/_/g, " ")}</p>
                  )}
                  {state.clientIvaCondition &&
                   state.clientIvaCondition.toLowerCase() !== "consumidor final" &&
                   state.clientIvaCondition.toLowerCase() !== "consumidor_final" &&
                   state.clientDocumentNumber && (
                    <p><span className="font-semibold">Documento:</span> {state.clientDocumentNumber}</p>
                  )}
                </div>

            </div>

            {billingInfo && (
              <div>
                {billingInfo.cuit && <p><span className="font-semibold">CUIT:</span> {billingInfo.cuit}</p>}
                {billingInfo.condicionIva && <p><span className="font-semibold">Condición IVA:</span> {billingInfo.condicionIva.replace("_", " ")}</p>}
                {billingInfo.inicioActividades && <p><span className="font-semibold">Inicio Actividades:</span> {moment(billingInfo.inicioActividades).format("DD/MM/YYYY")}</p>}
                {billingInfo.address && <p><span className="font-semibold">Dirección:</span> {billingInfo.address}</p>}
              </div>
            )}
          </div>
        </div>
      )}

      <ProductSearchBar
        onProductAdd={handleProductAdd}
        hasSupplierFilter={hasSupplierFilter}
      />

      {/* Products Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col">
        {/* Scrollable table area */}
        <div className="overflow-y-auto max-h-[calc(100vh-24rem)]">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] md:min-w-0">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700/50 text-left text-sm font-medium text-gray-500 dark:text-gray-400 sticky top-0 z-10">
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
                    <div className="flex items-center justify-center gap-2 print:hidden">
                      {["unidades", "unidad"].includes(product.unit.toLowerCase()) ? (
                        <>
                          <button
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-gray-600 dark:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed"
                            onClick={() => updateProductAmount(product.id, product.amount - 1)}
                            disabled={product.amount <= 1}
                            aria-label="Disminuir cantidad"
                          >
                            −
                          </button>
                          {editingProductId === product.id ? (
                            <input
                              type="number"
                              min="1"
                              step="1"
                              autoFocus
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => {
                                const val = Math.max(1, Number(editValue) || 1);
                                if (Number(editValue) < 1) {
                                  toast.error("La cantidad mínima es 1");
                                }
                                if (val !== product.amount) {
                                  updateProductAmount(product.id, val);
                                }
                                setEditingProductId(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  (e.target as HTMLInputElement).blur();
                                } else if (e.key === "Escape") {
                                  setEditingProductId(null);
                                }
                              }}
                              className="w-16 text-center font-medium tabular-nums border rounded-md px-1 py-0.5"
                            />
                          ) : (
                            <span
                              className="w-12 text-center font-medium tabular-nums cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded px-1 py-0.5"
                              onClick={() => {
                                setEditingProductId(product.id);
                                setEditValue(String(product.amount));
                              }}
                              title="Click para editar cantidad"
                            >
                              {product.amount}
                            </span>
                          )}
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
                    ${product.salePrice.toLocaleString("es-AR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    ${(product.salePrice * product.amount).toLocaleString("es-AR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                   <td className="px-4 py-3 print:hidden text-center align-middle w-12">
                    <button
                      onClick={() => removeItem(product)}
                      className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      aria-label={`Eliminar ${product.description}`}
                    >
                      <Trash2 className="h-4 w-4" />
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
        </div>

        {/* Totals Section - sticky at bottom */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-700/30 sticky bottom-0">
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

              {state.discount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Descuento ({state.discount}%)</span>
                  <span className="font-medium text-green-600 dark:text-green-400 tabular-nums">
                    -${totals.discountAmount.toLocaleString("es-AR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              )}

              <div className="flex justify-between text-3xl font-bold border-t border-gray-300 dark:border-gray-600 pt-2">
                <span>Total</span>
                <span className="font-mono tabular-nums tracking-tight text-primary">
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

      {/* CAE Section - Print only */}
      {isClient && state.CAE?.CAE && (
        <div className="print-visible mt-8 text-xs border-t border-gray-300 pt-4 pb-8">
          <div className="flex items-center justify-between gap-4">
            {state.CAE.qrData ? (
              <div className="shrink-0 bg-white p-1 rounded-sm">
                <QRCodeSVG value={state.CAE.qrData} size={110} level="M" includeMargin={false} />
              </div>
            ) : (
              <div className="w-[110px] shrink-0"></div>
            )}

            <div className="flex-1 text-center">
              <p className="font-bold text-[14px] mb-2 uppercase tracking-wide">Comprobante Autorizado</p>
              <p className="mb-1">
                <span className="font-bold text-gray-700">CAE:</span> <span className="text-[13px]">{state.CAE.CAE}</span>
              </p>
              <p className="mb-3">
                <span className="font-bold text-gray-700">Vencimiento:</span> <span className="text-[13px]">{state.CAE.vencimiento}</span>
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
