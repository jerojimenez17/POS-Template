"use client";
import React, { useEffect, useState, useTransition } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import noImgPhoto from "../../../public/no-image.svg";
import Image from "next/image";
import DeleteButton from "../DeleteButton";
import Modal from "../Modal";
import ProductForm from "./product-form";
import CodeBarModal from "./code-bar-modal";
import { Session } from "next-auth";
import { getProducts, deleteProduct } from "@/actions/stock";
import { ProductExtended } from "./product-form";
import { toast } from "sonner";

interface props {
  descriptionFilter: string;
  session: Session;
}

const StockTable = ({ descriptionFilter }: props) => {
  const [products, setProducts] = useState<ProductExtended[]>([]);
  const [productToEdit, setProductToEdit] = useState<ProductExtended>();
  const [openDeleteModal, setOpenDeleteModal] = useState(false);
  const [openEditModal, setOpenEditModal] = useState(false);
  const [, startTransition] = useTransition();

  const fetchProducts = async () => {
    const data = await getProducts();
    setProducts(data as ProductExtended[]);
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleDelete = async () => {
    if (!productToEdit) return;
    
    startTransition(async () => {
      const result = await deleteProduct(productToEdit.id);
      if (result.success) {
        toast.success(result.success);
        setProducts(products.filter(p => p.id !== productToEdit.id));
        setOpenDeleteModal(false);
      } else {
        toast.error(result.error);
      }
    });
  };

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
              <TableHead className="hover:text-gray-800 text-center font-extrabold text-white text-lg p-2">
                Precio de Venta
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
                const desc = product.description || "";
                const code = product.code || "";
                return (
                  desc.toLowerCase().includes(descriptionFilter.toLowerCase()) ||
                  code.toLowerCase().includes(descriptionFilter.toLowerCase())
                );
              })
              .sort((a, b) => {
                // Modified sorting to use creation_date
                const timeA = new Date(a.creation_date).getTime();
                const timeB = new Date(b.creation_date).getTime();
                return timeB - timeA;
              })
              .map((product) => {
                return (
                  <TableRow
                    onClick={() => {
                      setProductToEdit(product);
                      setOpenEditModal(true);
                    }}
                    className="text-center hover:text-black hover:bg-gray hover:backdrop-filter hover:backdrop-blur-lg items-center"
                    key={product.id}
                  >
                    <TableCell className="font-medium">
                      {product.code ? product.code : "-"}
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
                    <TableCell className="font-medium">
                      $
                      {Number(product.salePrice).toLocaleString("es-AR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </TableCell>
                    <TableCell className="items-center align-middle">
                      {product.image && product.image.includes("https") ? (
                        <Image
                          className="rounded-lg mx-auto"
                          src={product.image}
                          alt="Product"
                          height={145}
                          width={85}
                        />
                      ) : (
                        <Image
                          className="rounded-lg mx-auto"
                          src={noImgPhoto}
                          alt="No image"
                          height={70}
                          width={75}
                        />
                      )}
                    </TableCell>
                    <TableCell className="z-50">
                      <DeleteButton
                        id="deleteButton"
                        onClick={(e) => {
                          e.stopPropagation();
                          setProductToEdit(product);
                          setOpenDeleteModal(true);
                        } } disable={false}                      />
                      <CodeBarModal 
                      code={product.code || ""} 
                      description={product.description || ""}
                      salePrice={product.salePrice}
                      unit={product.unit ?? undefined}
                    />
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
          onCancel={() => setOpenDeleteModal(false)}
          visible={openDeleteModal}
          key={productToEdit.id}
          onClose={() => setOpenDeleteModal(false)}
          onAcept={handleDelete}
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
            onClose={() => {
              setOpenEditModal(false);
              fetchProducts(); // Refresh after edit
            }}
            product={productToEdit}
          />
        </Modal>
      )}
    </div>
  );
};

export default StockTable;
