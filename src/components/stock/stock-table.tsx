"use client";
import React, { useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import noImgPhoto from "../../../public/no-image.svg";
import { collection, deleteDoc, doc, onSnapshot } from "firebase/firestore";
import { db, storage } from "@/firebase/config";
import Product from "@/models/Product";
import Image from "next/image";
import DeleteButton from "../DeleteButton";
import Modal from "../Modal";
import { deleteObject, ref } from "firebase/storage";
import ProductForm from "./product-form";
import { ProductFirebaseAdapter } from "@/models/ProductFirebaseAdapter";
import CodeBarModal from "./code-bar-modal";
import { Session } from "next-auth";

interface props {
  descriptionFilter: string;
  session: Session;
}

const StockTable = ({ session, descriptionFilter }: props) => {
  const [products, setProducts] = useState<Product[]>();
  const [productToEdit, setProductToEdit] = useState<Product>();
  const [openDeleteModal, setOpenDeleteModal] = useState(false);
  const [openEditModal, setOpenEditModal] = useState(false);

  useEffect(() => {
    onSnapshot(collection(db, "stock"), (querySnapshot) => {
      const products = ProductFirebaseAdapter.fromDocumentDataArray(
        querySnapshot.docs
      );
      setProducts(products);
    });
  }, []);
  return (
    <div className="z-0 p-0 mx-auto mb-20 w-full h-[90%] flex px-4">
      <div className="rounded-t-xl overflow-auto shadow-lg w-full mx-auto">
        <Table className="text-gray-800 bg-white bg-opacity-20 shadow-sm p-5 w-full my-2  mx-auto z-0">
          <TableHeader className="bg-black bg-opacity-80 rounded-t-xl">
            <TableRow className=" hover:bg-gray hover:backdrop-filter">
              <TableHead className="hover:text-gray-800 text-center font-extrabold text-white text-lg p-2 -z-10 ">
                Codigo
              </TableHead>

              <TableHead className="hover:text-gray-800 text-center font-extrabold text-white text-lg p-2">
                Descripcion
              </TableHead>
              <TableHead className="hover:text-gray-800 text-center font-extrabold text-white text-lg p-2">
                Cantidad
              </TableHead>
              <TableHead className="hover:text-gray-800 text-center font-extrabold text-white text-lg p-2">
                Unidad
              </TableHead>
              {/* <TableHead className="hover:text-gray-800 text-center font-extrabold text-white text-lg p-2">
              Precio
            </TableHead> */}
              <TableHead className="hover:text-gray-800 text-center font-extrabold text-white text-lg p-2">
                Precio de Venta
              </TableHead>
              <TableHead className="hover:text-gray-800 text-center font-extrabold text-white text-lg p-2">
                Color
              </TableHead>
              <TableHead className="hover:text-gray-800 text-center font-extrabold text-white text-lg p-2">
                Peso
              </TableHead>
              <TableHead className="hover:text-gray-800 text-center font-extrabold text-white text-lg p-2">
                Medidas
              </TableHead>
              <TableHead className="hover:text-gray-800 text-center font-extrabold text-white text-lg p-2">
                Foto
              </TableHead>
              <TableHead className="hover:text-gray-800 text-center font-extrabold text-white text-lg p-1">
                Acciones
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody className="">
            {products
              ?.filter((product) => {
                return (
                  product.description
                    .toLowerCase()
                    .includes(descriptionFilter.toLowerCase()) ||
                  product.code
                    .toLowerCase()
                    .includes(descriptionFilter.toLowerCase()) //TO DO: Implement switch only cod
                );
              })
              .sort((a, b) => {
                const timeA = new Date(a.creation_date).getTime();
                const timeB = new Date(b.creation_date).getTime();

                return timeB - timeA; // Ordena de más reciente a más antiguo
              })
              .sort((a, b) => {
                const timeA = a.creation_date.getTime();
                const timeB = b.creation_date.getTime();
                if (timeA < timeB) {
                  return 1; // Si b es más nuevo, lo coloca antes
                } else if (timeA > timeB) {
                  return -1; // Si a es más nuevo, lo coloca antes
                } else {
                  return 0; // Son iguales en términos de fecha y hora
                }
              })
              .sort((a, b) => {
                //sort first with amount equal to zero
                if (a.amount <= 0 && b.amount !== 0) return -1;
                if (a.amount !== 0 && b.amount <= 0) return 1;
                return 0;
              })
              .map((product) => {
                return (
                  <TableRow
                    onClick={() => {
                      // if (
                      //   session.user?.email === process.env.ADMIN_EMAIL ||
                      //   session.user?.email?.includes("manu@renata.com")
                      // ) {
                      setProductToEdit(product);
                      setOpenEditModal(true);
                      // }
                    }}
                    className="text-center hover:text-black hover:bg-gray hover:backdrop-filter hover:backdrop-blur-lg items-center"
                    key={product.id}
                  >
                    <TableCell className="font-medium">
                      {product.code ? product.code : "asd"}
                    </TableCell>

                    <TableCell className="font-medium">
                      {product.description}
                    </TableCell>
                    <TableCell
                      className={`font-medium ${
                        product.amount <= 0 ? "text-red-500" : ""
                      }`}
                    >
                      {product.amount}
                    </TableCell>
                    <TableCell className="font-medium">
                      {product.unit}
                    </TableCell>
                    {/* <TableCell className="font-medium">
                    ${product.price}
                  </TableCell> */}
                    <TableCell className="font-medium">
                      $
                      {Number(product.salePrice).toLocaleString("es-AR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </TableCell>
                    {/* <TableCell className="font-medium">
                      {product.color}
                    </TableCell>
                    <TableCell className="font-medium">
                      {product.peso}
                    </TableCell>
                    <TableCell className="font-medium">
                      {product.medidas}
                    </TableCell> */}
                    <TableCell className="items-center align-middle">
                      {product.image.includes("https") ? (
                        <Image
                          className="rounded-lg mx-auto"
                          src={product.image}
                          alt="Image Not Found"
                          height={145}
                          width={85}
                        />
                      ) : (
                        <Image
                          className="rounded-lg mx-auto"
                          src={noImgPhoto}
                          alt="Image Not Found"
                          height={70}
                          width={75}
                        />
                      )}
                    </TableCell>
                    <TableCell className="z-50">
                      <DeleteButton
                        disable={
                          session.user?.email !== process.env.ADMIN_EMAIL &&
                          session.user?.email !== "manu@renata.com"
                        }
                        id="deleteButton"
                        onClick={(e) => {
                          e.stopPropagation(); // Evita que el clic se propague a la fila
                          setProductToEdit(product);
                          setOpenDeleteModal(true);
                          console.log(openDeleteModal);
                        }}
                      />
                      <CodeBarModal value={product.code}></CodeBarModal>
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </div>
      {productToEdit && openDeleteModal && (
        <Modal
          className="z-50 absolute"
          blockButton={false}
          onCancel={() => {
            setOpenDeleteModal(false);
          }}
          visible={openDeleteModal}
          key={productToEdit.id}
          onClose={() => {
            setOpenDeleteModal(false);
          }}
          onAcept={async () => {
            console.log(productToEdit);
            if (productToEdit.image !== "") {
              const fileRef = ref(storage, `${productToEdit.image}`);
              await deleteObject(fileRef);
            }
            await deleteDoc(doc(db, "stock", productToEdit.id));
            setOpenDeleteModal(false);
          }}
          message="Seguro que desea eliminar este producto?"
        />
      )}
      {productToEdit && (
        <Modal
          onClose={() => setOpenEditModal(false)}
          visible={openEditModal}
          blockButton={false}
        >
          <ProductForm
            onClose={() => setOpenEditModal(false)}
            product={productToEdit}
          />
        </Modal>
      )}
    </div>
  );
};

export default StockTable;
