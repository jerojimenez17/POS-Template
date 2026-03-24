"use client";
import { useContext, useRef } from "react";
import { Sheet, SheetContent, SheetTrigger } from "../ui/sheet";
import { CartContext } from "./context/CartContext";
import Image from "next/image";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { Button } from "../ui/button";
import AddUnitButton from "../ui/add-unit-button";
import LessUnitButton from "../ui/less-unit-button";

const OrderButtonSheet = () => {
  const { cartState, addUnit, removeUnit } =
    useContext(CartContext);
  const printRef = useRef(null);
  // const handlePrint = useReactToPrint({
  //   content: () => printRef.current,
  //   pageStyle: `
  //   @media print {
  //     body {
  //       margin: 0;
  //       padding: 0;
  //     }
  //     @page {
  //       size: auto;
  //       margin: 10mm;
  //     }
  //     table {
  //       width: 100%;
  //       page-break-inside: auto;
  //     }
  //     tr, td, th {
  //       page-break-inside: avoid;
  //       break-inside: avoid;
  //     }

  //     /* Estilo para mantener el footer en la última página */
  //     tfoot {
  //       position: sticky;
  //       bottom: 0;
  //       background-color: white;
  //     }

  //     /* Evitar que el tfoot se repita en todas las páginas */
  //     tfoot:before {
  //       content: "";
  //       display: table-row;
  //       height: 12px;
  //       page-break-before: always;
  //     }

  //     /* Evitar que se repitan imágenes o contenido innecesario en cada página */
  //     tbody img {
  //       page-break-inside: avoid;
  //     }
  //   }
  // `,
  // });
  return (
    <Sheet>
      <div className="relative">
        <SheetTrigger className="bg-gray-400 hover:bg-gray-200 p-2 font-semibold bg-opacity-65 rounded-full">
          <div className="">Ver Pedido</div>
        </SheetTrigger>
        {cartState.products.length > 0 && (
          <div className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
            {cartState.products.length}
          </div>
        )}
      </div>
      <SheetContent
        className="h-5/6 w-full bg-white bg-opacity-85 overflow-auto rounded-md"
        side={"bottom"}
      >
        <div ref={printRef} className="">
          <div className="hidden print:flex ">
            <Image
              className="mx-auto w-76 h-1/2"
              height={120}
              width={320}
              src={
                "https://firebasestorage.googleapis.com/v0/b/vcda-app.appspot.com/o/logoRoot2.png?alt=media&token=428dc1cd-26b0-4516-8f5b-f656b89d028b"
              }
              alt="VCD"
            />
          </div>
          <Table className="text-white print:text-gray-800 print:m-0 w-full text-center my-4">
            <TableHeader className="bg-black bg-opacity-85 text-center text-opacity-100 text-white ">
              <TableRow className="gap-0">
                <TableHead className="w-5 text-center print:hidden">
                  Imagen
                </TableHead>
                <TableHead className="text-center w-2">Codigo</TableHead>
                <TableHead className="text-center w-15">Descripcion</TableHead>
                <TableHead className="text-center">Unidad</TableHead>
                <TableHead className="text-center">Cantidad</TableHead>
                <TableHead className="text-center">Precio</TableHead>
                <TableHead className="text-center">SubTotal</TableHead>
                <TableHead className="text-center">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="text-black">
              {cartState.products?.map((product) => (
                <TableRow
                  // onClick={() => addItem(product)}
                  className=" hover:bg-opacity-60 rounded-md hover:shadow-gray-700 hover:shadow-md bg-white bg-opacity-30"
                  key={product.id}
                >
                  {product.image.includes("https") ? (
                    <TableCell className="print:hidden">
                      <Image
                        className="mx-auto my-auto rounded-lg"
                        src={product.image}
                        width={100}
                        height={80}
                        alt="Sin foto"
                      />
                    </TableCell>
                  ) : (
                    <TableCell className="print:hidden">
                      <Image
                        className="rounded-lg mx-auto"
                        src={"./no-image.svg"}
                        alt="Image Not Found"
                        height={50}
                        width={70}
                      />
                    </TableCell>
                  )}
                  <TableCell className="">{product.code}</TableCell>
                  <TableCell>{product.description}</TableCell>
                  <TableCell>{product.unit}</TableCell>
                  <TableCell>{product.amount}</TableCell>
                  <TableCell>
                    $
                    {product.salePrice.toLocaleString("es-AR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </TableCell>
                  <TableCell>
                    {(product.amount * product.salePrice).toLocaleString(
                      "es-AR",
                      { minimumFractionDigits: 2, maximumFractionDigits: 2 }
                    )}
                  </TableCell>
                  <TableCell className="print:hidden">
                    <AddUnitButton
                      disabled={false}
                      onClick={() => addUnit(product)}
                    />
                    <LessUnitButton
                      onClick={() => removeUnit(product)}
                      disabled={false}
                    />
                    {/* <DeleteButton onClick={() => removeItem(product)} /> */}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className="print:flex print:w-full">
                <TableCell className="print:flex hidden w-1/2">
                  {"              "}
                </TableCell>
                <TableCell className="print:flex hidden w-1/2">
                  {"              "}
                </TableCell>
                <TableCell className="print:flex hidden w-1/2">
                  {"                 "}
                </TableCell>
                <TableCell className="print:flex hidden w-1/2">
                  {"               "}
                </TableCell>

                <TableCell className=" print:w-full font-bold text-black print:flex text-xl print:justify-center">
                  Total
                </TableCell>
                <TableCell className=" print:w-full font-bold text-black print:flex text-xl print:justify-center">
                  $
                  {cartState.products
                    .reduce((acc, p) => acc + p.salePrice * p.amount, 0)
                    .toLocaleString("es-AR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                </TableCell>
                <TableCell className="print:hidden">
                  <Button variant="default">
                    Imprimir
                  </Button>

                  {/* {session && !catalogo ? (
                    <SaveOrder
                      user={session?.user.email || ""}
                      client={client}
                    />
                  ) : order ? (
                    <EditOrder order={order} />
                  ) : (
                    <> {"No esta Logeado Para hacer pedido"}</>
                  )} */}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default OrderButtonSheet;
