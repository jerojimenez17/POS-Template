"use client";
import React, { useContext, useRef, useState, useEffect } from "react";
import { useReactToPrint } from "react-to-print";
import { BillContext } from "@/context/BillContext";
import { getProductByCode, getProductsBySearch } from "@/actions/stock";
import { ProductPrismaAdapter } from "@/models/ProductPrismaAdapter";
import Product from "@/models/Product";
import BillState from "@/models/BillState";
import DecimalInput from "./DecimalInput";
import dynamic from "next/dynamic";
import { Session } from "next-auth";
import { IDetectedBarcode } from "@yudiel/react-qr-scanner";
import { cn } from "@/lib/utils";
import { Inter } from "next/font/google";
import { getBusinessBillingInfoAction } from "@/actions/business";
import moment from "moment";

// Dynamically import scanner to avoid SSR issues
const Scanner = dynamic(
  () => import("@yudiel/react-qr-scanner").then((mod) => mod.Scanner),
  { ssr: false }
);

interface Props {
  printTrigger: number;
  className: string;
  handleClose: () => void;
  session: Session | null;
  externalState?: BillState;
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

const PrintableTable = ({
  printTrigger,
  session,
  className,
  externalState,
}: Props) => {
  const { BillState, addItem, removeItem } = useContext(BillContext);
  const [errorMessage, setErrorMessage] = useState("");
  const [searchCode, setSearchCode] = useState("");
  const [suggestions, setSuggestions] = useState<Product[]>([]);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [state, setState] = useState<BillState>(externalState || BillState || defaultBillState);
  const [isClient, setIsClient] = useState(false);
  const [billingInfo, setBillingInfo] = useState<{
    razonSocial?: string | null;
    cuit?: string | null;
    condicionIva?: string | null;
    inicioActividades?: Date | string | null;
    address?: string | null;
  } | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const lastPrintTrigger = useRef(0);

  // Fix hydration: Only run on client
  useEffect(() => {
    setIsClient(true);
    
    // Fetch billing info
    const fetchBillingInfo = async () => {
      const info = await getBusinessBillingInfoAction();
      if (info) setBillingInfo(info);
    };
    fetchBillingInfo();
  }, []);

  const handlePrint = useReactToPrint({
    contentRef: contentRef || undefined,
    documentTitle: `Factura_${(state?.date || new Date()).toISOString().split("T")[0]}`,
    onBeforePrint: () => Promise.resolve(), // Sometimes helps Safari rendering lifecycle
    pageStyle: `
      @page { size: auto; margin: 10mm; }
      @media print {
        html, body {
          width: 100% !important;
          min-width: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        body { -webkit-print-color-adjust: exact; }
        .print-header { display: block !important; }
        table { width: 100% !important; table-layout: fixed; }
        th, td { word-wrap: break-word; }
        .print-hidden { display: none !important; }
        .print-visible { display: block !important; }
      }
    `,
  });

  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => setErrorMessage(""), 3000);
      return () => clearTimeout(timer);
    }
  }, [errorMessage]);

  useEffect(() => {
    setState(externalState || BillState || defaultBillState);
  }, [externalState, BillState]);

  useEffect(() => {
    if (printTrigger > lastPrintTrigger.current && isClient && !scannerOpen) {
      lastPrintTrigger.current = printTrigger;
      handlePrint();
    }
  }, [printTrigger, isClient, scannerOpen, handlePrint]);

  const updateProductAmount = (productId: string, newAmount: number) => {
    const product = state.products.find((p) => p.id === productId);
    if (!product) return;

    const updatedProduct = { ...product, amount: newAmount };
    removeItem(product);
    addItem(updatedProduct);
  };

  const handleAddProduct = async (code: string) => {
    const product = await getProductByCode(code);
    if (!product) {
      setErrorMessage("Producto no encontrado");
      return;
    }

    if (product.amount <= 0) {
      setErrorMessage("Producto sin Stock");
      return;
    }

    const adaptedProduct = ProductPrismaAdapter.toDomain(product);
    addItem({ ...adaptedProduct, amount: 1 });
    setSearchCode("");
  };

  const handleSearch = async (value: string) => {
    setSearchCode(value);
    if (value.length >= 2) {
      const results = await getProductsBySearch(value);
      setSuggestions(results.map(ProductPrismaAdapter.toDomain));
    } else {
      setSuggestions([]);
    }
  };

  const handleScannerResult = (result: IDetectedBarcode[]) => {
    if (result && result.length > 0) {
      handleAddProduct(result[0].rawValue);
    }
    setScannerOpen(false);
  };

  const sortByDescription = (a: Product, b: Product) => {
    if (a.description < b.description) {
      return -1;
    }
    if (a.description > b.description) {
      return 1;
    }
    return 0;
  };
  const renderProductRow = (product: Product) => (
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
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-gray-600 dark:text-gray-300"
                onClick={() => updateProductAmount(product.id, product.amount - 1)}
                aria-label="Disminuir cantidad"
              >
                −
              </button>
              <span className="w-12 text-center font-medium tabular-nums">{product.amount}</span>
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
  );

  return (
    <div ref={contentRef} className={`${className} print:block print:bg-white overflow-visible`}>
      {/* Header - Print only */}
      {isClient && (
        <div className="print-visible print:mb-4 mt-4 print:text-center hidden">
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
                  {state.CAE && state.CAE.CAE !== "" ? "Factura:" : "Comprobante:"}
                </span>{" "}
                {state.CAE && state.CAE.CAE !== "" ? (state.billType || "C") : "Remito"}
              </p>
              <p><span className="font-semibold">Vendedor:</span> {state.seller || session?.user?.email}</p>
              <p><span className="font-semibold">Medio de Pago:</span> {state.paidMethod}</p>
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

      {/* Product Search - Screen only */}
      <div className="mb-6 max-w-7xl mx-auto print:hidden">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.3-4.3"/>
              </svg>
            </div>
            <input
              name="productSearch"
              className="flex w-full rounded-lg border border-input bg-white dark:bg-gray-800 px-3 py-3 pl-10 text-base shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm text-gray-900 dark:text-gray-100"
              placeholder="Buscar producto por codigo o nombre..."
              value={searchCode}
              onChange={(e) => handleSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddProduct(searchCode);
              }}
              autoComplete="off"
              spellCheck={false}
            />
            {suggestions.length > 0 && searchCode.length > 0 && (
              <div className="absolute z-20 w-full mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-xl max-h-72 overflow-y-auto">
                {suggestions.map((product) => (
                  <div
                    key={product.id}
                    className="p-4 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors"
                    onClick={() => handleAddProduct(product.code)}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-mono text-sm text-blue-600 dark:text-blue-400">{product.code}</span>
                        {product.brand && (
                          <span className="ml-2 text-xs font-medium bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-gray-600 dark:text-gray-300">
                            {product.brand}
                          </span>
                        )}
                      </div>
                      <span className={cn(
                        "font-semibold text-xs px-2 py-1 rounded-full",
                        product.amount <= 5 ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      )}>
                        Stock: {product.amount}
                      </span>
                    </div>
                    <div className="mt-1 font-medium text-gray-900 dark:text-gray-100">
                      {product.description}
                    </div>
                    <div className="mt-1 font-bold text-lg text-gray-700 dark:text-gray-300">
                      ${product.salePrice.toLocaleString("es-AR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button
            className="px-4 py-3 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors focus-visible:ring-1 focus-visible:ring-ring"
            onClick={() => setScannerOpen(true)}
            aria-label="Escanear codigo"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7V5a2 2 0 0 1 2-2h2"/>
              <path d="M17 3h2a2 2 0 0 1 2 2v2"/>
              <path d="M21 17v2a2 2 0 0 1-2 2h-2"/>
              <path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
              <line x1="7" y1="12" x2="17" y2="12"/>
            </svg>
          </button>
        </div>
        {errorMessage && (
          <div className="text-red-500 mt-2 text-sm font-medium">{errorMessage}</div>
        )}
      </div>

      {/* Scanner Modal - Only render on client */}
      {isClient && scannerOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center print-hidden">
          <div className="bg-white p-4 rounded-lg w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">Escanear producto</h3>
              <button
                className="text-gray-500 hover:text-gray-700 focus-visible:ring-2 focus-visible:ring-gray-400 rounded p-1 transition-colors"
                onClick={() => setScannerOpen(false)}
                aria-label="Cerrar escáner"
              >
                ✕
              </button>
            </div>
            <Scanner formats={["code_128", "codabar", "qr_code", "ean_13", "ean_8"]}
              onScan={handleScannerResult}
            />
          </div>
        </div>
      )}

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
              {state.products.sort(sortByDescription).map(renderProductRow)}
              {state.products.length === 0 && (
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
                  ${state.products.reduce((sum, p) => sum + p.salePrice * p.amount, 0).toLocaleString("es-AR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>

              {state.discount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Descuento ({state.discount}%)</span>
                  <span className="font-medium text-green-600 dark:text-green-400 tabular-nums">
                    -${(
                      state.products.reduce((sum, p) => sum + p.salePrice * p.amount, 0) *
                      (state.discount / 100)
                    ).toLocaleString("es-AR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              )}

              <div className="flex justify-between text-lg font-bold border-t border-gray-300 dark:border-gray-600 pt-2">
                <span>Total</span>
                <span className="tabular-nums">
                  ${(
                    state.products.reduce((sum, p) => sum + p.salePrice * p.amount, 0) *
                    (1 - state.discount / 100)
                  ).toLocaleString("es-AR", {
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
        <div className="print-visible mt-8 text-xs border-t border-gray-300 pt-4">
          <p className="text-center">
            <strong>CAE:</strong> {state.CAE.CAE} |
            <strong> Vencimiento:</strong> {state.CAE.vencimiento}
          </p>
          <p className="mt-2 text-center italic">
            El crédito fiscal discriminado en el presente comprobante, sólo
            podrá ser computado a efectos del Régimen de Sostenimiento e
            Inclusión Fiscal para Pequeños Contribuyentes de la Ley N°27.618
          </p>
        </div>
      )}
    </div>
  );
};

export default PrintableTable;
