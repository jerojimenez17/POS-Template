"use client";

import { useTransition, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  ColumnDef,
  getPaginationRowModel,
} from "@tanstack/react-table";
import Image from "next/image";
import noImgPhoto from "../../public/no-image.svg";
import Modal from "@/components/Modal";
import ProductForm from "./stock/product-form";
import { Button } from "./ui/button";
import DeleteButton from "./DeleteButton";
import CodeBarModal from "./stock/code-bar-modal";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { deleteProduct } from "@/actions/stock";
import { toast } from "sonner";
import { ProductExtended } from "./stock/product-form";
import { Package } from "lucide-react";

interface ProductDataTableProps {
  products: ProductExtended[];
  descriptionFilter: string;
  onRefresh?: () => void;
}

const ProductDataTable: React.FC<ProductDataTableProps> = ({
  products,
  descriptionFilter,
  onRefresh,
}) => {
  const [openDeleteModal, setOpenDeleteModal] = useState(false);
  const [openEditModal, setOpenEditModal] = useState(false);
  const [productToEdit, setProductToEdit] = useState<ProductExtended | null>(null);
  const [isPending, startTransition] = useTransition();

  const filteredProducts = products
    ?.filter((product) => {
      const desc = product.description || "";
      const code = product.code || "";
      return (
        desc.toLowerCase().includes(descriptionFilter.toLowerCase()) ||
        code.toLowerCase().includes(descriptionFilter.toLowerCase())
      );
    })
    .sort((a, b) => {
      const timeA = new Date(a.creation_date).getTime();
      const timeB = new Date(b.creation_date).getTime();
      return timeB - timeA;
    }) ?? [];

  const columns: ColumnDef<ProductExtended>[] = [
    {
      accessorKey: "image",
      header: "Foto",
      cell: ({ row }) => {
        const imageUrl = row.original.image;
        return (
          <div className="flex justify-center items-center">
            {imageUrl && imageUrl.includes("https") ? (
              <Image
                className="rounded-lg object-cover"
                src={imageUrl}
                alt="Product"
                height={50}
                width={50}
              />
            ) : (
              <Image
                className="rounded-lg opacity-50"
                src={noImgPhoto}
                alt="No image"
                height={40}
                width={40}
              />
            )}
          </div>
        );
      },
      size: 80,
    },
    {
      accessorKey: "code",
      header: "Código",
      cell: ({ getValue }) => (
        <span className="font-mono text-xs">
          {(getValue() as string) || "-"}
        </span>
      ),
      size: 100,
    },
    {
      accessorKey: "description",
      header: "Descripción",
      cell: ({ getValue }) => (
        <span className="font-medium">
          {(getValue() as string) || "Sin descripción"}
        </span>
      ),
      size: 300,
    },
    {
      accessorKey: "brand",
      header: "Marca",
      cell: ({ row }) => {
        const brandData = row.original.brand;
        const brandName =
          typeof brandData === "object" && brandData !== null
            ? (brandData as { name: string }).name
            : brandData;
        return <span>{brandName || "-"}</span>;
      },
      size: 120,
    },
    {
      accessorKey: "amount",
      header: "Cant.",
      cell: ({ getValue }) => {
        const amount = getValue() as number;
        return (
          <span
            className={`font-medium ${
              amount <= 0 ? "text-red-500 dark:text-red-400 font-semibold" : ""
            }`}
          >
            {amount}
          </span>
        );
      },
      size: 80,
    },
    {
      accessorKey: "salePrice",
      header: "Precio",
      cell: ({ getValue }) => (
        <span className="font-medium">
          $
          {Number(getValue()).toLocaleString("es-AR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
      ),
      size: 100,
    },
    {
      id: "actions",
      header: "Acciones",
      cell: ({ row }) => {
        const product = row.original;
        return (
          <div className="flex items-center justify-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                setProductToEdit(product);
                setOpenEditModal(true);
              }}
              className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                <path d="m15 5 4 4" />
              </svg>
            </Button>
            <DeleteButton
              onClick={(e) => {
                e.stopPropagation();
                setProductToEdit(product);
                setOpenDeleteModal(true);
              }}
              disable={false}
            />
            <CodeBarModal value={product.code || ""} />
          </div>
        );
      },
      size: 120,
    },
  ];

  const table = useReactTable({
    data: filteredProducts,
    columns,
    getPaginationRowModel: getPaginationRowModel(),
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  const handleDelete = async () => {
    if (!productToEdit) return;
    startTransition(async () => {
      const result = await deleteProduct(productToEdit.id);
      if (result.success) {
        toast.success(result.success);
        setOpenDeleteModal(false);
        if (onRefresh) onRefresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const hasProducts = filteredProducts.length > 0;
  const hasFilter = descriptionFilter.trim().length > 0;

  return (
    <div className="w-full flex flex-col">
      {/* Desktop Table View */}
      <div className="hidden md:block rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow
                key={headerGroup.id}
                className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50"
              >
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    style={{ width: header.getSize() }}
                    className="text-center font-semibold text-gray-700 dark:text-gray-200 h-12"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {!hasProducts ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-48 text-center"
                >
                  <div className="flex flex-col items-center gap-3 py-4">
                    <div className="w-14 h-14 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                      <Package className="w-7 h-7 text-gray-400" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-base font-medium text-gray-900 dark:text-gray-100">
                        {hasFilter
                          ? "No se encontraron productos"
                          : "No hay productos registrados"}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {hasFilter
                          ? "Probá con otros términos de búsqueda"
                          : "Agregá tu primer producto para comenzar"}
                      </p>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className="text-center py-3"
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3 pb-24">
        {!hasProducts ? (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-8 flex flex-col items-center gap-3 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <Package className="w-8 h-8 text-gray-400" />
            </div>
            <div className="space-y-1">
              <p className="text-base font-medium text-gray-900 dark:text-gray-100">
                {hasFilter
                  ? "No se encontraron productos"
                  : "No hay productos registrados"}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {hasFilter
                  ? "Probá con otros términos de búsqueda"
                  : "Agregá tu primer producto para comenzar"}
              </p>
            </div>
          </div>
        ) : (
          table.getRowModel().rows.map((row) => {
            const product = row.original;
            return (
              <div
                key={row.id}
                className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex gap-3"
              >
                {/* Product Image */}
                <div className="w-20 h-20 shrink-0 bg-gray-50 dark:bg-gray-800 rounded-lg overflow-hidden border border-gray-100 dark:border-gray-700">
                  {product.image && product.image.includes("https") ? (
                    <Image
                      className="w-full h-full object-cover"
                      src={product.image}
                      alt={product.description || "Product"}
                      height={80}
                      width={80}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Image
                        src={noImgPhoto}
                        alt="No image"
                        className="w-10 h-10 opacity-40"
                      />
                    </div>
                  )}
                </div>

                {/* Product Details */}
                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start mb-1">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate pr-2">
                        {product.description || "Sin descripción"}
                      </h3>
                    </div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                        {product.code || "-"}
                      </span>
                      {product.brand && (
                        <span className="text-[10px] uppercase font-bold tracking-wide text-gray-500 dark:text-gray-400">
                          {typeof product.brand === "object" && product.brand !== null
                            ? (product.brand as { name: string }).name
                            : product.brand}
                        </span>
                      )}
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-base font-bold text-gray-900 dark:text-white">
                        $
                        {Number(product.salePrice).toLocaleString("es-AR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                      <span
                        className={`text-xs ${
                          product.amount <= 0
                            ? "text-red-500 font-semibold"
                            : "text-gray-500 dark:text-gray-400"
                        }`}
                      >
                        {product.amount} unid.
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col justify-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      setProductToEdit(product);
                      setOpenEditModal(true);
                    }}
                    className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                      <path d="m15 5 4 4" />
                    </svg>
                  </Button>
                  <DeleteButton
                    onClick={(e) => {
                      e.stopPropagation();
                      setProductToEdit(product);
                      setOpenDeleteModal(true);
                    }}
                    disable={false}
                  />
                  <CodeBarModal value={product.code || ""} />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {hasProducts && (
        <div className="flex items-center justify-between px-2 py-4">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Total: {filteredProducts.length} productos
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="h-8 px-3"
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="h-8 px-3"
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}

      {productToEdit && openDeleteModal && (
        <Modal
          className="z-50 absolute"
          blockButton={isPending}
          onCancel={() => setOpenDeleteModal(false)}
          visible={openDeleteModal}
          key={productToEdit.id}
          onClose={() => setOpenDeleteModal(false)}
          onAcept={handleDelete}
          message="¿Seguro que desea eliminar este producto?"
        />
      )}

      {productToEdit && openEditModal && (
        <Dialog open={openEditModal} onOpenChange={setOpenEditModal}>
          <DialogContent className="sm:max-w-lg overflow-auto h-full max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>Editar producto</DialogTitle>
            </DialogHeader>

            <ProductForm
              onClose={() => {
                setOpenEditModal(false);
                if (onRefresh) onRefresh();
              }}
              product={productToEdit}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default ProductDataTable;
