"use client";
import BillState from "@/models/BillState";
import React, { useContext, useEffect, useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import { ProductFirebaseAdapter } from "@/models/ProductFirebaseAdapter";
import { Scanner } from "@yudiel/react-qr-scanner";
import { BillContext } from "@/context/BillContext";
import { Input } from "../ui/input";
import getProductByCode from "@/firebase/stock/getProduct";
import { Button } from "../ui/button";
import { Session } from "next-auth";

interface Props {
  print: boolean;
  className: string;
  handleClose: () => void;
  session: Session | null;
  externalState?: BillState;
}
const PrintableTable = ({ print, className, externalState }: Props) => {
  const { BillState, addItem, removeItem } = useContext(BillContext);
  const [searchCode, setSearchCode] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [scanerOpen, setScanerOpen] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [state, setState] = useState<BillState>(externalState || BillState);

  // const inputDescription = useRef<any>();
  // useEffect(() => {
  //   inputDescription.current.focus();
  // }, [BillState.products]);
  const contentRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({ contentRef });
  useEffect(() => {
    setTimeout(() => {
      setErrorMessage("");
    }, 3000);
  }, [errorMessage]);

  useEffect(() => {
    if (externalState !== undefined) {
      console.log(externalState);
      setState(externalState);
    } else {
      setState(BillState);
    }
    console.log(externalState ? "externalState" : "BillState");
  }, [externalState, print, addItem]);

  useEffect(() => {
    if (print === true) {
      handlePrint();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [print]);
  // const handleBlur = () => {
  //   if (description !== "" && units !== 0 && price !== 0) {
  //     addItem(new Product(description, units, Number(price.toFixed(2))));
  //     console.log("entro");
  //     setPrice(0);
  //     setUnits(0);
  //     setDescription("");
  //   }
  // };

  return (
    <div
      ref={contentRef}
      className={` print:h-full print:overflow-hidden my-2  print:block ${
        className !== "" ? className : "hidden"
      }`}
    >
      <div className="hidden print:flex print:text-5xl h-full font-bold justify-center text-gray-700">
        <h2 className=" text-center">Tu App</h2>
      </div>
      <div>
        <div className="hidden print:flex flex-col justify-center text-center mx-auto my-10 print:text-lg">
          <p>
            Fecha: {state.date?.toLocaleDateString()}{" "}
            {state.date?.toLocaleTimeString()}
          </p>
          <p>Factura: {state.billType}</p>
          <p>Cuit: 27374057893</p>
          <p>Condicion IVA: Monotributo</p>
          <p>IIBB: 27374057893</p>
          <p>Inicio Actividades :xx-xx-xxxx</p>
          <p>Vendedor: {state.seller}</p>
          <p>Medio de Pago: {state.paidMethod}</p>
        </div>
        <div className="hidden print:flex flex-col justify-center text-center mx-auto print:text-lg">
          <p>Compronte: 000001-{state.CAE?.nroComprobante}</p>
          <p>Condicion IVA Cliente: {state.IVACondition}</p>
          {state.billType !== "C" && (
            <p>Comprobante asociado: {state.nroAsociado}</p>
          )}
        </div>
      </div>
      <div className="w-full m-0 flex justify-center flex-col place-items-center gap-0 h-12">
        <div className="flex mx-auto w-1/3">
          <div className=" align-middle mx-auto items-center">
            <Input
              className="text-black md:w-lg flex print:hidden mt-2 p-2 shadow "
              placeholder={"Buscar producto"}
              value={searchCode}
              onChange={(e) => {
                setSearchCode(e.currentTarget.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  console.log("Entra");
                  getProductByCode(e.currentTarget.value).then((product) => {
                    if (product) {
                      if (product[0].amount > 0) {
                        const adaptedProduct =
                          ProductFirebaseAdapter.fromDocumentData(
                            product[0],
                            product[0].id
                          );
                        const productToCart = { ...adaptedProduct, amount: 1 };
                        addItem(productToCart);
                        setSearchCode("");
                      } else {
                        setErrorMessage("Producto sin Stock");
                      }
                    } else {
                      setErrorMessage("Producto no encontrado");
                    }
                  });
                }
              }}
            ></Input>
          </div>
          <div className="flex w-28 my-auto">
            <Button
              className="bg-transparent hover:fill-white font-bold print:hidden text-2xl p-2"
              onClick={() => setScanerOpen(true)}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="70px"
                height="70px"
                viewBox="0 0 32 32"
                id="svg5"
                version="1.1"
              >
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
            </Button>
          </div>
        </div>
        {scanerOpen && (
          <div className="h-full w-full items-center flex  z-10">
            <Button
              className=" absolute top-24 z-30 right-4 text-white font-bold"
              onClick={() => setScanerOpen(false)}
            >
              Cerrar Scaner
            </Button>
            <div className=" md:mx-auto">
              <Scanner
                formats={["code_128", "codabar", "qr_code", "ean_13", "ean_8"]}
                onScan={(result) => {
                  getProductByCode(result[0].rawValue).then((product) => {
                    if (product) {
                      const adaptedProduct =
                        ProductFirebaseAdapter.fromDocumentData(
                          product[0],
                          product[0].id
                        );
                      const productToCart = { ...adaptedProduct, amount: 1 };
                      addItem(productToCart);
                      console.log(BillState);
                      setSearchCode("");
                    } else {
                      setErrorMessage("Producto no encontrado");
                    }
                  });
                  setScanerOpen(false);
                }}
              />
            </div>
          </div>
        )}
        {errorMessage !== "" && (
          <div className="text-center flex mx-auto text-red-600 text-lg">
            {errorMessage}
          </div>
        )}
      </div>

      <div className=" w-full my-2 mx-auto overflow-auto">
        <div className="w-3/4 flex rounded-xl mx-auto overflow-hidden shadow-xl">
          <table className="table-auto w-full mx-auto print:w-2/3">
            <thead className="bg-black rounded-xl backdrop-blur-3xl text-center text-white">
              <tr>
                <th className="p-3">Descripcion</th>
                <th className="p-3">Unidades</th>
                <th className="p-3">Precio</th>
                <th className="p-3">Subtotal</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody className="overflow-auto text-center">
              {state.products.map((product) => {
                return (
                  <tr
                    key={product.id}
                    className="even:bg-slate-200 text-black h-fit"
                  >
                    <td className="">{product.description} </td>
                    <td className="p-2">{product.amount}</td>
                    <td className="p-2">
                      $
                      {product.salePrice.toLocaleString("es-AR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="p-2">
                      ${product.salePrice * product.amount}
                    </td>
                    <td className="p-2 print:hidden">
                      <button onClick={() => removeItem(product)}>
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
              })}
              {/* <tr className="align-middle print:hidden">
            <td className="p-2 md:w-3">
            <input
            autoFocus
            value={description}
                ref={inputDescription}
                onChange={(e) => {
                  setDescription(e.target.value);
                }}
                className="border-gray-800 text-black bg-transparent border-b-2 focus:outline-none text-center focus:border-pink-300 w-24 md:w-max lg:w-max"
                type="text"
                placeholder="Descripcion"
              />
              </td>
              <td className="p-2 max-w-fit">
              <input
                value={units !== 0 ? units : ""}
                onChange={(e) => {
                  setUnits(Number(e.target.value));
                }}
                className="border-gray-800 bg-transparent text-center text-black border-b-2 focus:outline-none focus:border-pink-300 w-6 md:w-8 lg:w-max"
                type="number"
                placeholder={units.toString()}
                />
            </td>
            <td className="p-2 ">
              <input
                value={price !== 0 ? price : ""}
                placeholder={price.toString()}
                onChange={(e) => {
                  setPrice(Number(e.target.value));
                }}
                onKeyDownCapture={(e) => {
                  console.log(e.key);
                  if (e.key === "Enter") {
                    handleBlur();
                    inputDescription.current.focus();
                    }
                }}
                className="border-gray-800 bg-transparent border-b-2 text-center focus:outline-none focus:border-pink-300 text-black w-12 md:w-16 lg:w-max"
                type="number"
              ></input>
            </td>
          </tr> */}
            </tbody>
          </table>
        </div>
        <div className=" mt-20 h-fit relative flex print:h-18 bg-white/20 text-center w-3/4 shadow-lg shadow-gray-300 rounded-xl mb-4 mx-auto justify-center flex-col">
          <p className="print:text-gray-900 font-mono font-bold print:text-3xl text-lg  print:mx-auto">
            Total: $
            {state.products
              .reduce((acc, p) => acc + p.salePrice * p.amount, 0)
              .toLocaleString("es-AR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
          </p>
          {state.discount !== 0 && (
            <div className="print:mx-auto print:mb-2">
              <p className="print:text-gray-900 font-mono font-bold print:text-3xl text-lg">
                Descuento: %{state.discount}
              </p>
              <p className="print:text-gray-900 font-mono font-bold print:text-3xl text-xl text-black ">
                Final: $
                {(
                  state.products.reduce(
                    (acc, p) => acc + p.salePrice * p.amount,
                    0
                  ) -
                  state.products.reduce(
                    (acc, p) => acc + p.salePrice * p.amount,
                    0
                  ) *
                    state.discount *
                    0.01
                ).toLocaleString("es-AR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>
          )}
        </div>
      </div>
      {state.CAE?.CAE !== "" && state.IVACondition === "Consumidor Final" && (
        <div className="hidden justify-center print:flex mx-auto w-2/3 ">
          El crédito fiscal discriminado en el presente comprobante, sólo podrá
          ser computado a efectos del Régimen de Sostenimiento e Inclusión
          Fiscal para Pequeños Contribuyentes de la Ley N°27.618
        </div>
      )}
      {state.CAE?.CAE !== "" && (
        <div className="hidden print:flex justify-center mt-10">
          <p>CAE:{state.CAE?.CAE}</p>
          <br />
          <p>Vencimiento CAE:{state.CAE?.vencimiento}</p>
        </div>
      )}
      {state.CAE?.CAE !== "" && (
        <div className="hidden print:flex h-48 w-48 justify-center mx-auto">
          {state.CAE?.qrData && (
            // <img
            //   className="h-full w-full"
            //   src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&format=png&data=${state.CAE.qrData}`}
            //   alt=""
            // /><>
            <></>
          )}
        </div>
      )}
    </div>
  );
};

export default PrintableTable;
