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

interface ProductDataTableProps {
  products: any[];
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
  const [productToEdit, setProductToEdit] = React.useState<any>(null);
  const [isPending, startTransition] = useTransition();

  const filteredProducts = React.useMemo(() => {
    if (!products) return [];
    return products
      .filter(
        (product) => {
          const desc = product.description || "";
          const code = product.code || "";
          return desc.toLowerCase().includes(descriptionFilter.toLowerCase()) ||
                 code.toLowerCase().includes(descriptionFilter.toLowerCase());
        }
      )
      .sort((a, b) => {
        const timeA = new Date(a.creation_date).getTime();
        const timeB = new Date(b.creation_date).getTime();
        return timeB - timeA;
      });
  }, [products, descriptionFilter]);

  const columns = React.useMemo<ColumnDef<any>[]>(
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
              <CodeBarModal value={product.code} />
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
    <div className="z-0 p-0 mx-auto mb-28 md:mb-20 w-full h-full rounded-xl shadow-sm overflow-hidden border border-black/10">
      <div className=" h-[90%] overflow-auto">
        <table className="text-gray-800 max-h-full border-separate border-spacing-0 bg-white dark:hover:bg-gray-800 dark:hover:backdrop-filter dark:bg-gray-900 dark:text-white bg-opacity-20 backdrop-filter w-full z-0">
          <thead className="bg-black h-20 mt-0 sticky top-0 z-10">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr
                key={headerGroup.id}
                className="hover:bg-gray hover:backdrop-filter"
              >
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="hover:text-gray-800 text-center font-extrabold text-white dark:hover:text-gray-200 text-lg"
                  >
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
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className="text-center hover:text-black hover:bg-gray hover:backdrop-filter hover:backdrop-blur-lg items-center border-b dark:hover:bg-gray-800 dark:hover:backdrop-filter dark:bg-gray-900 dark:text-white bg-opacity-20 backdrop-filter"
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="p-2">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="w-full flex justify-end gap-x-2 p-4 bg-black/5">
        <Button
          variant="outline"
          className="font-bold text-xl rounded-xl border-black"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          {"<"}
        </Button>
        <Button
          variant="outline"
          className="font-bold text-xl rounded-xl border-black"
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
          <DialogContent className="sm:max-w-md overflow-auto h-full">
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
