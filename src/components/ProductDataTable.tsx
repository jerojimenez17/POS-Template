import React, { useTransition } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  ColumnDef,
  getPaginationRowModel,
} from "@tanstack/react-table";
import Image from "next/image";
import noImgPhoto from "../../public/no-image.svg";
import Modal from "./Modal";
import ProductForm from "./stock/product-form";
import { Button } from "./ui/button";
import DeleteButton from "./DeleteButton";
import CodeBarModal from "./stock/code-bar-modal";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { deleteProduct } from "@/actions/stock";
import { toast } from "sonner";
import { ProductExtended } from "./stock/product-form";

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
  const [openDeleteModal, setOpenDeleteModal] = React.useState(false);
  const [openEditModal, setOpenEditModal] = React.useState(false);
  const [productToEdit, setProductToEdit] = React.useState<ProductExtended | null>(null);
  const [isPending, startTransition] = useTransition();

  const filteredProducts = React.useMemo(() => {
    if (!products) return [];
    return products
      .filter(
        (product) => {
          const desc = product.description || "";
          const code = product.code || "";
          const brand = product.brand?.name || "";
          return desc.toLowerCase().includes(descriptionFilter.toLowerCase()) ||
                 code.toLowerCase().includes(descriptionFilter.toLowerCase()) ||
                 brand.toLowerCase().includes(descriptionFilter.toLowerCase());
        }
      )
      .sort((a, b) => {
        const timeA = new Date(a.creation_date).getTime();
        const timeB = new Date(b.creation_date).getTime();
        return timeB - timeA;
      });
  }, [products, descriptionFilter]);

  const columns = React.useMemo<ColumnDef<ProductExtended>[]>(
    () => [
      {
        accessorKey: "code",
        header: () => (
          <div className="text-center font-extrabold text-white text-lg p-2">
            Código
          </div>
        ),
        cell: (info) => (
          <div className="font-medium text-center">
            {info.getValue() as string || "-"}
          </div>
        ),
      },
      {
        accessorKey: "description",
        header: () => (
          <div className="text-center font-extrabold text-white text-lg p-2">
            Descripción
          </div>
        ),
        cell: (info) => (
          <div className="font-medium text-center">
            {info.getValue() as string}
          </div>
        ),
      },
      {
        accessorKey: "brand.name",
        header: () => (
          <div className="text-center font-extrabold text-white text-lg p-2">
            Marca
          </div>
        ),
        cell: (info) => (
          <div className="font-medium text-center">
            {info.getValue() as string || "-"}
          </div>
        ),
      },
      {
        accessorKey: "amount",
        header: () => (
          <div className="text-center font-extrabold text-white text-lg p-2">
            Cantidad
          </div>
        ),
        cell: (info) => (
          <div
            className={`font-medium text-center ${
              (info.getValue() as number) <= 0
                ? "text-red-500 font-semibold"
                : ""
            }`}
          >
            {info.getValue() as string}
          </div>
        ),
      },
      {
        accessorKey: "salePrice",
        header: () => (
          <div className="text-center font-extrabold text-white text-lg p-2">
            Precio de Venta
          </div>
        ),
        cell: (info) => (
          <div className="font-medium text-center">
            $
            {Number(info.getValue()).toLocaleString("es-AR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
        ),
      },
      {
        accessorKey: "image",
        header: () => (
          <div className="text-center font-extrabold text-white text-lg p-2">
            Foto
          </div>
        ),
        cell: (info) => {
          const imageUrl = info.getValue() as string;
          return (
            <div className="flex justify-center items-center">
              {imageUrl && imageUrl.includes("https") ? (
                <Image
                  className="rounded-lg mx-auto"
                  src={imageUrl}
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
            </div>
          );
        },
      },
      {
        id: "actions",
        header: () => (
          <div className="text-center font-extrabold text-white text-lg p-1">
            Acciones
          </div>
        ),
        cell: ({ row }) => {
          const product = row.original;
          return (
            <div className="flex justify-center space-x-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setProductToEdit(product);
                  setOpenEditModal(true);
                }}
                className="px-2 py-1 text-white rounded"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="30px"
                  height="30px"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M8.56078 20.2501L20.5608 8.25011L15.7501 3.43945L3.75012 15.4395V20.2501H8.56078ZM15.7501 5.56077L18.4395 8.25011L16.5001 10.1895L13.8108 7.50013L15.7501 5.56077ZM12.7501 8.56079L15.4395 11.2501L7.93946 18.7501H5.25012L5.25012 16.0608L12.7501 8.56079Z"
                    fill="#5564eb"
                  />
                </svg>
              </button>
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
      },
    ],
    []
  );

  const table = useReactTable({
    data: filteredProducts,
    columns,
    getPaginationRowModel: getPaginationRowModel(),
    getCoreRowModel: getCoreRowModel(),
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

  return (
    <div className="w-full h-full flex flex-col">
      {/* Desktop Table View */}
      <div className="hidden md:block rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden bg-white dark:bg-gray-900">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 dark:bg-gray-800 text-xs uppercase text-gray-500 dark:text-gray-400 font-semibold">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th key={header.id} className="px-6 py-4 whitespace-nowrap">
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-6 py-4">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-4 pb-24">
        {table.getRowModel().rows.map((row) => {
          const product = row.original;
          return (
            <div
              key={row.id}
              className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-4 flex gap-4"
            >
              {/* Product Image */}
              <div className="w-24 h-24 shrink-0 bg-gray-50 dark:bg-gray-800 rounded-lg overflow-hidden border border-gray-100 dark:border-gray-700">
                 {product.image && product.image.includes("https") ? (
                  <Image
                    className="w-full h-full object-cover"
                    src={product.image}
                    alt={product.description || "Product"}
                    height={96}
                    width={96}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300">
                    <Image
                      src={noImgPhoto}
                      alt="No image"
                      className="w-12 h-12 opacity-50"
                    />
                  </div>
                )}
              </div>

              {/* Product Details */}
              <div className="flex-1 min-w-0 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-1">
                    <h3 className="text-base font-bold text-gray-900 dark:text-white truncate pr-2">
                       {product.description || "Sin descripción"}
                    </h3>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200">
                      {product.code || "-"}
                    </span>
                  </div>
                  {product.brand && (
                    <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">
                      {product.brand.name}
                    </p>
                  )}
                  
                  <div className="flex items-baseline gap-2 mb-2">
                     <span className="text-lg font-bold text-black dark:text-white">
                      ${Number(product.salePrice).toLocaleString("es-AR")}
                     </span>
                     <span className={`text-sm ${product.amount <= 0 ? "text-red-500 font-bold" : "text-gray-500"}`}>
                        {product.amount} unid.
                     </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-2 mt-2">
                   <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setProductToEdit(product);
                      setOpenEditModal(true);
                    }}
                    className="p-2 text-blue-600 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 rounded-lg transition-colors"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
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
                  </button>
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
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      <div className="w-full flex justify-end gap-x-2 p-4 mt-4">
        <Button
          variant="outline"
          className="h-10 w-10 p-0 rounded-lg"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          {"<"}
        </Button>
        <Button
           variant="outline"
           className="h-10 w-10 p-0 rounded-lg"
           onClick={() => table.nextPage()}
           disabled={!table.getCanNextPage()}
        >
          {">"}
        </Button>
      </div>

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
          <DialogContent className="sm:max-w-md overflow-auto h-full max-h-[90vh]">
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
