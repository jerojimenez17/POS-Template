"use client";
import React, { useContext, useRef, useState, useEffect } from "react";
import { useReactToPrint } from "react-to-print";
import { BillContext } from "@/context/BillContext";
import { ProductFirebaseAdapter } from "@/models/ProductFirebaseAdapter";
import getProductByCode from "@/firebase/stock/getProduct";
import getProductsBySearch from "@/firebase/stock/getProductBySearch";
import Product from "@/models/Product";
import BillState from "@/models/BillState";
import DecimalInput from "./DecimalInput";
import dynamic from "next/dynamic";
import { Session } from "next-auth";
import { IDetectedBarcode } from "@yudiel/react-qr-scanner";
import { cn } from "@/lib/utils";
import { Great_Vibes } from "next/font/google";

// Dynamically import scanner to avoid SSR issues
const Scanner = dynamic(
  () => import("@yudiel/react-qr-scanner").then((mod) => mod.Scanner),
  { ssr: false }
);

interface Props {
  print: boolean;
  className: string;
  handleClose: () => void;
  session: Session | null;
  externalState?: BillState;
}
const greatVibes = Great_Vibes({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-great-vibes",
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
  print,
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
  const contentRef = useRef<HTMLDivElement>(null);

  // Fix hydration: Only run on client
  useEffect(() => {
    setIsClient(true);
  }, []);

  const handlePrint = useReactToPrint({
    contentRef: contentRef || undefined,
    documentTitle: `Factura_${(state?.date || new Date()).toISOString().split("T")[0]}`,
    pageStyle: `
      @page { size: auto; margin: 5mm; }
      @media print {
        body { -webkit-print-color-adjust: exact; }
        .print-header { display: block !important; }
        .print-table { width: 100% !important; }
        .print-hidden { display: none !important; }
        .print-visible { display: block !important; }
        .print-text { font-size: 12pt !important; }
        .print-total { font-size: 14pt !important; }
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
    if (print && isClient) {
      handlePrint();
    }
  }, [print, isClient]);

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

    if (product[0].amount <= 0) {
      setErrorMessage("Producto sin Stock");
      return;
    }

    const adaptedProduct = ProductFirebaseAdapter.fromDocumentData(
      product[0],
      product[0].id
    );
    addItem({ ...adaptedProduct, amount: 1 });
    setSearchCode("");
  };

  const handleSearch = async (value: string) => {
    setSearchCode(value);
    if (value.length >= 2) {
      const results = await getProductsBySearch(value);
      setSuggestions(results);
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
      className="even:bg-slate-100 dark:even:bg-gray-900 dark:text-white text-black"
    >
      <td className="p-1 print:p-1 print:text-sm">{product.description}</td>
      <td className="p-1 flex justify-center items-center gap-1">
        {["unidades", "unidad"].includes(product.unit.toLowerCase()) ? (
          <div className="flex items-center">
            <button
              className="px-1 font-bold text-lg bg-red-600/40  rounded hover:bg-gray-300 print:hidden"
              onClick={() =>
                updateProductAmount(product.id, product.amount - 1)
              }
            >
              −
            </button>
            <span className="mx-1 print:mx-0">{product.amount}</span>
            <button
              className="px-1 font-bold text-lg bg-green-700/40 rounded hover:bg-gray-300 print:hidden"
              onClick={() =>
                updateProductAmount(product.id, product.amount + 1)
              }
            >
              +
            </button>
          </div>
        ) : (
          <DecimalInput
            initial={product.amount}
            product={product}
            updateAmount={updateProductAmount}
          />
        )}
      </td>
      <td className="p-1 print:p-1 print:text-sm">
        $
        {product.salePrice.toLocaleString("es-AR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
      </td>
      <td className="p-1 print:p-1 print:text-sm">
        $
        {(product.salePrice * product.amount).toLocaleString("es-AR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
      </td>
      <td className="p-1 print:hidden">
        <button onClick={() => removeItem(product)}>
          {/* SVG paths remain the same */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 100 100"
            width="30px"
            height="30px"
          >
            <path
              fill="#f37e98"
              d="M25,30l3.645,47.383C28.845,79.988,31.017,82,33.63,82h32.74c2.613,0,4.785-2.012,4.985-4.617L75,30"
            />
            <path
              fill="#f15b6c"
              d="M65 38v35c0 1.65-1.35 3-3 3s-3-1.35-3-3V38c0-1.65 1.35-3 3-3S65 36.35 65 38zM53 38v35c0 1.65-1.35 3-3 3s-3-1.35-3-3V38c0-1.65 1.35-3 3-3S53 36.35 53 38zM41 38v35c0 1.65-1.35 3-3 3s-3-1.35-3-3V38c0-1.65 1.35-3 3-3S41 36.35 41 38zM77 24h-4l-1.835-3.058C70.442 19.737 69.14 19 67.735 19h-35.47c-1.405 0-2.707.737-3.43 1.942L27 24h-4c-1.657 0-3 1.343-3 3s1.343 3 3 3h54c1.657 0 3-1.343 3-3S78.657 24 77 24z"
            />
            <path
              fill="#1f212b"
              d="M66.37 83H33.63c-3.116 0-5.744-2.434-5.982-5.54l-3.645-47.383 1.994-.154 3.645 47.384C29.801 79.378 31.553 81 33.63 81H66.37c2.077 0 3.829-1.622 3.988-3.692l3.645-47.385 1.994.154-3.645 47.384C72.113 80.566 69.485 83 66.37 83zM56 20c-.552 0-1-.447-1-1v-3c0-.552-.449-1-1-1h-8c-.551 0-1 .448-1 1v3c0 .553-.448 1-1 1s-1-.447-1-1v-3c0-1.654 1.346-3 3-3h8c1.654 0 3 1.346 3 3v3C57 19.553 56.552 20 56 20z"
            />
            <path
              fill="#1f212b"
              d="M77,31H23c-2.206,0-4-1.794-4-4s1.794-4,4-4h3.434l1.543-2.572C28.875,18.931,30.518,18,32.265,18h35.471c1.747,0,3.389,0.931,4.287,2.428L73.566,23H77c2.206,0,4,1.794,4,4S79.206,31,77,31z M23,25c-1.103,0-2,0.897-2,2s0.897,2,2,2h54c1.103,0,2-0.897,2-2s-0.897-2-2-2h-4c-0.351,0-0.677-0.185-0.857-0.485l-1.835-3.058C69.769,20.559,68.783,20,67.735,20H32.265c-1.048,0-2.033,0.559-2.572,1.457l-1.835,3.058C27.677,24.815,27.351,25,27,25H23z"
            />
            <path
              fill="#1f212b"
              d="M61.5 25h-36c-.276 0-.5-.224-.5-.5s.224-.5.5-.5h36c.276 0 .5.224.5.5S61.776 25 61.5 25zM73.5 25h-5c-.276 0-.5-.224-.5-.5s.224-.5.5-.5h5c.276 0 .5.224.5.5S73.776 25 73.5 25zM66.5 25h-2c-.276 0-.5-.224-.5-.5s.224-.5.5-.5h2c.276 0 .5.224.5.5S66.776 25 66.5 25zM50 76c-1.654 0-3-1.346-3-3V38c0-1.654 1.346-3 3-3s3 1.346 3 3v25.5c0 .276-.224.5-.5.5S52 63.776 52 63.5V38c0-1.103-.897-2-2-2s-2 .897-2 2v35c0 1.103.897 2 2 2s2-.897 2-2v-3.5c0-.276.224-.5.5-.5s.5.224.5.5V73C53 74.654 51.654 76 50 76zM62 76c-1.654 0-3-1.346-3-3V47.5c0-.276.224-.5.5-.5s.5.224.5.5V73c0 1.103.897 2 2 2s2-.897 2-2V38c0-1.103-.897-2-2-2s-2 .897-2 2v1.5c0 .276-.224.5-.5.5S59 39.776 59 39.5V38c0-1.654 1.346-3 3-3s3 1.346 3 3v35C65 74.654 63.654 76 62 76z"
            />
            <path
              fill="#1f212b"
              d="M59.5 45c-.276 0-.5-.224-.5-.5v-2c0-.276.224-.5.5-.5s.5.224.5.5v2C60 44.776 59.776 45 59.5 45zM38 76c-1.654 0-3-1.346-3-3V38c0-1.654 1.346-3 3-3s3 1.346 3 3v35C41 74.654 39.654 76 38 76zM38 36c-1.103 0-2 .897-2 2v35c0 1.103.897 2 2 2s2-.897 2-2V38C40 36.897 39.103 36 38 36z"
            />
          </svg>
        </button>
      </td>
    </tr>
  );

  return (
    <div ref={contentRef} className={`${className} print:block print:bg-white`}>
      {/* Header - Print only */}
      {isClient && (
        <div className="print-visible print:mb-4 mt-4 print:text-center hidden">
          <h2
            className={cn(
              "text-5xl font-bold text-gray-800",
              greatVibes.className
            )}
          >
           Nombre de App
          </h2>
          <div className="mt-2 text-sm">
            <p>
              Fecha: {state.date?.toLocaleDateString()}{" "}
              {state.date?.toLocaleTimeString()}
            </p>
            <p>Factura: {state.billType}</p>
            <p>Cuit: 27374057893</p>
            <p>Condicion IVA: Monotributo</p>
            <p>Vendedor: {state.seller || session?.user?.email}</p>
            <p>Medio de Pago: {state.paidMethod}</p>
          </div>
        </div>
      )}

      {/* Product Search - Screen only */}
      <div className="print-hidden mb-4 mx-2">
        <div className="flex mx-auto gap-2">
          <div className="md:w-1/2 flex-1 relative">
            <input
              className="w-full p-2 border border-gray-300 rounded shadow"
              placeholder="Buscar producto"
              value={searchCode}
              onChange={(e) => handleSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddProduct(searchCode);
              }}
            />
            {suggestions.length > 0 && searchCode.length > 0 && (
              <div className="absolute z-10 w-full bg-inherit border border-gray-300 rounded mt-1 shadow-lg">
                {suggestions.map((product) => (
                  <div
                    key={product.id}
                    className="p-2 hover:bg-gray-100 dark:even:bg-gray-700 bg-gray-100 even:bg-gray-300 dark:bg-gray-900 cursor-pointer"
                    onClick={() => handleAddProduct(product.code)}
                  >
                    {product.code} - {product.description} - $
                    {product.salePrice.toLocaleString("es-AR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                    <span className="font-semibold"> Restan: </span>
                    {product.amount}
                  </div>
                ))}
              </div>
            )}
          </div>
          <button
            className="p-2 bg-gray-200 rounded hover:bg-gray-300"
            onClick={() => setScannerOpen(true)}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24px"
              height="24px"
              viewBox="0 0 32 32"
            >
              {" "}
              <defs id="defs2" />
              <g id="layer1" transform="translate(-108,-100)">
                <path
                  d="m 111,106 a 1.0001,1.0001 0 0 0 -1,1 v 3 a 1,1 0 0 0 1,1 1,1 0 0 0 1,-1 v -2 h 2 a 1,1 0 0 0 1,-1 1,1 0 0 0 -1,-1 z"
                  id="path11698"
                />

                <path
                  d="m 134,106 a 1,1 0 0 0 -1,1 1,1 0 0 0 1,1 h 2 v 2 a 1,1 0 0 0 1,1 1,1 0 0 0 1,-1 v -3 a 1.0001,1.0001 0 0 0 -1,-1 z"
                  id="path11700"
                />

                <path
                  d="m 137,121 a 1,1 0 0 0 -1,1 v 2 h -2 a 1,1 0 0 0 -1,1 1,1 0 0 0 1,1 h 3 a 1.0001,1.0001 0 0 0 1,-1 v -3 a 1,1 0 0 0 -1,-1 z"
                  id="path11702"
                />

                <path
                  d="m 111,121 a 1,1 0 0 0 -1,1 v 3 a 1.0001,1.0001 0 0 0 1,1 h 3 a 1,1 0 0 0 1,-1 1,1 0 0 0 -1,-1 h -2 v -2 a 1,1 0 0 0 -1,-1 z"
                  id="path11704"
                />

                <path
                  d="m 115,110 a 1,1 0 0 0 -1,1 v 10 a 1,1 0 0 0 1,1 1,1 0 0 0 1,-1 v -10 a 1,1 0 0 0 -1,-1 z"
                  id="path11706"
                />

                <path
                  d="m 118,110 a 1,1 0 0 0 -1,1 v 10 a 1,1 0 0 0 1,1 1,1 0 0 0 1,-1 v -10 a 1,1 0 0 0 -1,-1 z"
                  id="path11708"
                />

                <path
                  d="m 121,110 a 1,1 0 0 0 -1,1 v 10 a 1,1 0 0 0 1,1 1,1 0 0 0 1,-1 v -10 a 1,1 0 0 0 -1,-1 z"
                  id="path11710"
                />

                <path
                  d="m 124,110 a 1,1 0 0 0 -1,1 v 10 a 1,1 0 0 0 1,1 1,1 0 0 0 1,-1 v -10 a 1,1 0 0 0 -1,-1 z"
                  id="path11712"
                />

                <path
                  d="m 127,110 a 1,1 0 0 0 -1,1 v 10 a 1,1 0 0 0 1,1 1,1 0 0 0 1,-1 v -10 a 1,1 0 0 0 -1,-1 z"
                  id="path11714"
                />

                <path
                  d="m 130,110 a 1,1 0 0 0 -1,1 v 10 a 1,1 0 0 0 1,1 1,1 0 0 0 1,-1 v -10 a 1,1 0 0 0 -1,-1 z"
                  id="path11716"
                />

                <path
                  d="m 133,110 a 1,1 0 0 0 -1,1 v 5.20703 1.31445 V 121 a 1,1 0 0 0 1,1 1,1 0 0 0 1,-1 V 117.52148 116.20703 111 a 1,1 0 0 0 -1,-1 z"
                  id="path11720"
                />
              </g>
            </svg>
          </button>
        </div>
        {errorMessage && (
          <div className="text-red-600 mt-1 text-center">{errorMessage}</div>
        )}
      </div>

      {/* Scanner Modal - Only render on client */}
      {isClient && scannerOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center print-hidden">
          <div className="bg-white p-4 rounded-lg w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">Escanear producto</h3>
              <button
                className="text-gray-500 hover:text-gray-700"
                onClick={() => setScannerOpen(false)}
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
      <div className="overflow-x-auto print:overflow-visible">
        <table className="w-[98%] mx-auto border-collapse text-center print-table ">
          <thead>
            <tr className="bg-gray-800 text-white">
              <th className="p-2 text-left print:p-1 print:text-sm">
                Descripción
              </th>
              <th className="p-2 print:p-1 print:text-sm">Unidades</th>
              <th className="p-2 print:p-1 print:text-sm">Precio</th>
              <th className="p-2 print:p-1 print:text-sm">Subtotal</th>
              <th className="print-hidden"></th>
            </tr>
          </thead>
          <tbody>
            {state.products.sort(sortByDescription).map(renderProductRow)}
          </tbody>
        </table>
      </div>

      {/* Totals Section */}
      <div className="mt-4 p-4 dark:bg-gray-700 bg-gray-100 rounded-lg print:mt-8 print:bg-transparent">
        <div className="grid grid-cols-2 gap-2 text-right">
          <div className="font-bold">Subtotal:</div>
          <div>
            $
            {state.products
              .reduce((sum, p) => sum + p.salePrice * p.amount, 0)
              .toLocaleString("es-AR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
          </div>

          {state.discount > 0 && (
            <>
              <div className="font-bold">Descuento ({state.discount}%):</div>
              <div>
                -$
                {(
                  state.products.reduce(
                    (sum, p) => sum + p.salePrice * p.amount,
                    0
                  ) *
                  (state.discount / 100)
                ).toLocaleString("es-AR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
            </>
          )}

          <div className="font-bold text-lg border-t border-gray-300 pt-2 mt-2">
            Total:
          </div>
          <div className="text-lg border-t border-gray-300 pt-2 mt-2">
            $
            {(
              state.products.reduce(
                (sum, p) => sum + p.salePrice * p.amount,
                0
              ) *
              (1 - state.discount / 100)
            ).toLocaleString("es-AR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
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
