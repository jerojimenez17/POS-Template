"use client";
import React, { useEffect, useState, useTransition, useCallback } from "react";
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
import ProductForm from "./product-form";
import BarcodeModal from "./BarcodeModal";
import { Button } from "../ui/button";
import { Edit2, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Session } from "next-auth";
import { getProductsPaginated, deleteProduct, toggleProductCatalogAction } from "@/actions/stock";
import { ProductExtended } from "./product-form";
import { toast } from "sonner";
import { Switch } from "../ui/switch";
import { PAGINATION } from "@/lib/pagination";

interface props {
  descriptionFilter: string;
  session: Session;
}

const StockTable = ({ descriptionFilter }: props) => {
  const [products, setProducts] = useState<ProductExtended[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [productToEdit, setProductToEdit] = useState<ProductExtended>();
  const [openDeleteModal, setOpenDeleteModal] = useState(false);
  const [openEditModal, setOpenEditModal] = useState(false);
  const [, startTransition] = useTransition();

  const fetchProducts = useCallback(async (pageNum: number) => {
    try {
      const result = await getProductsPaginated({
        page: pageNum,
        pageSize: PAGINATION.DEFAULT_PAGE_SIZE,
        search: descriptionFilter || undefined,
      });
      setProducts(result.products as ProductExtended[]);
      setTotalPages(result.totalPages);
      setPage(result.page);
    } catch (error) {
      console.error("Error fetching products:", error);
    }
  }, [descriptionFilter]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const result = await getProductsPaginated({
          page: 1,
          pageSize: PAGINATION.DEFAULT_PAGE_SIZE,
          search: descriptionFilter || undefined,
        });
        if (!cancelled) {
          setProducts(result.products as ProductExtended[]);
          setTotalPages(result.totalPages);
          setPage(result.page);
        }
      } catch (error) {
        console.error("Error fetching products:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [descriptionFilter]);

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || (totalPages > 0 && newPage > totalPages)) return;
    fetchProducts(newPage);
  };

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
              <TableHead className="hover:text-gray-800 text-center font-extrabold text-white text-lg p-2">
                Catálogo
              </TableHead>
              <TableHead className="hover:text-gray-800 text-center font-extrabold text-white text-lg p-1">
                Acciones
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody className="">
            {products
              .filter((product) => {
                const desc = product.description || "";
                const code = product.code || "";
                const codebar = product.codebar || "";
                return (
                  desc.toLowerCase().includes(descriptionFilter.toLowerCase()) ||
                  code.toLowerCase().includes(descriptionFilter.toLowerCase()) ||
                  codebar.toLowerCase().includes(descriptionFilter.toLowerCase())
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
                      className={`font-medium ${product.amount <= 0 ? "text-red-500" : ""
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
                    <TableCell className="text-center">
                      <Switch
                        checked={product.catalog !== false}
                        onCheckedChange={(checked) => {
                          setProducts((prev) =>
                            prev.map((p) =>
                              p.id === product.id ? { ...p, catalog: checked } : p
                            )
                          );
                          startTransition(async () => {
                            const result = await toggleProductCatalogAction(product.id, checked);
                            if (result.error) {
                              toast.error(result.error);
                              setProducts((prev) =>
                                prev.map((p) =>
                                  p.id === product.id ? { ...p, catalog: !checked } : p
                                )
                              );
                            }
                          });
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </TableCell>
                    <TableCell className="text-right space-x-2 z-50" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setProductToEdit(product);
                          setOpenEditModal(true);
                        }}
                        className="h-8 w-8 text-slate-500 hover:text-blue-600"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          setProductToEdit(product);
                          setOpenDeleteModal(true);
                        }}
                        className="h-8 w-8 text-slate-500 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <BarcodeModal
                        productId={product.id}
                        code={product.code}
                        codebar={product.codebar || undefined}
                        description={product.description || ""}
                        salePrice={product.salePrice}
                        unit={product.unit ?? undefined}
                        onSuccess={(newCodebar) => {
                          setProducts((prev) =>
                            prev.map((p) =>
                              p.id === product.id ? { ...p, codebar: newCodebar } : p
                            )
                          );
                        }}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>

        {/* Pagination controls */}
        {totalPages > 0 && (
          <div className="flex items-center justify-between px-6 py-4 bg-white bg-opacity-20 border-t border-gray-200">
            <span className="text-sm text-gray-700 font-medium">
              Página {page} de {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(page - 1)}
                disabled={page <= 1}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(page + 1)}
                disabled={page >= totalPages}
              >
                Siguiente
              </Button>
            </div>
          </div>
        )}
      </div>
      {openDeleteModal && (
        <AlertDialog open={openDeleteModal} onOpenChange={setOpenDeleteModal}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminar producto</AlertDialogTitle>
              <AlertDialogDescription>
                ¿Estás seguro de que deseas eliminar este producto? Esta acción no se puede deshacer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete}>Eliminar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      <Dialog open={openEditModal} onOpenChange={setOpenEditModal}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar producto</DialogTitle>
          </DialogHeader>
          <ProductForm
            onClose={() => {
              setOpenEditModal(false);
              fetchProducts(page);
            }}
            product={productToEdit!}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StockTable;
