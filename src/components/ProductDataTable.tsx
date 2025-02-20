import React from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  ColumnDef,
  getPaginationRowModel,
} from "@tanstack/react-table";
import Image from "next/image";
import Product from "@/models/Product";
import noImgPhoto from "../../public/no-image.svg";
import Modal from "./Modal";
import { deleteObject, ref } from "firebase/storage";
import { db, storage } from "@/firebase/config";
import { deleteDoc, doc } from "firebase/firestore";
import ProductForm from "./stock/product-form";
import { Button } from "./ui/button";
import DeleteButton from "./DeleteButton";
import CodeBarModal from "./stock/code-bar-modal";

// Supongamos que recibes products y descriptionFilter como props:
interface ProductDataTableProps {
  products: Product[];
  descriptionFilter: string;
  // Puedes incluir otros props, por ejemplo, para la sesión
}

const ProductDataTable: React.FC<ProductDataTableProps> = ({
  products,
  descriptionFilter,
}) => {
  // Estados para controlar modales y el producto a editar/borrar
  const [openDeleteModal, setOpenDeleteModal] = React.useState(false);
  const [openEditModal, setOpenEditModal] = React.useState(false);
  const [productToEdit, setProductToEdit] = React.useState<Product | null>(
    null
  );

  // Filtrado y ordenamiento de los productos
  const filteredProducts = React.useMemo(() => {
    if (!products) return [];
    return products
      .filter(
        (product) =>
          product.description
            .toLowerCase()
            .includes(descriptionFilter.toLowerCase()) ||
          product.code.toLowerCase().includes(descriptionFilter.toLowerCase())
      )
      .sort((a, b) => {
        const timeA = new Date(a.creation_date).getTime();
        const timeB = new Date(b.creation_date).getTime();
        return timeB - timeA; // Más reciente primero
      });
  }, [products, descriptionFilter]);

  // Definición de columnas usando tanstack/react-table
  const columns = React.useMemo<ColumnDef<Product>[]>(
    () => [
      {
        accessorKey: "code",
        header: () => (
          <div className="text-center font-extrabold text-white text-lg p-2">
            Código
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
        accessorKey: "units",
        header: () => (
          <div className="text-center font-extrabold text-white text-lg p-2">
            Cantidad
          </div>
        ),
        cell: (info) => (
          <div className="font-medium text-center">
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
        accessorKey: "color",
        header: () => (
          <div className="text-center font-extrabold text-white text-lg p-2">
            Color
          </div>
        ),
        cell: (info) => (
          <div className="font-medium text-center">
            {info.getValue() as string}
          </div>
        ),
      },
      {
        accessorKey: "peso",
        header: () => (
          <div className="text-center font-extrabold text-white text-lg p-2">
            Peso
          </div>
        ),
        cell: (info) => (
          <div className="font-medium text-center">
            {info.getValue() as string}
          </div>
        ),
      },
      {
        accessorKey: "medidas",
        header: () => (
          <div className="text-center font-extrabold text-white text-lg p-2">
            Medidas
          </div>
        ),
        cell: (info) => (
          <div className="font-medium text-center">
            {info.getValue() as string}
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
              {imageUrl.includes("https") ? (
                <Image
                  className="rounded-lg mx-auto"
                  src={imageUrl}
                  alt="Image Not Found"
                  height={145}
                  width={85}
                />
              ) : (
                <Image
                  className="rounded-lg mx-auto"
                  src={noImgPhoto} // ruta o import de imagen por defecto
                  alt="Image Not Found"
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

  // Configuración de la tabla con tanstack/react-table
  const table = useReactTable({
    data: filteredProducts,
    columns,
    getPaginationRowModel: getPaginationRowModel(),
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="z-0 p-0 mx-auto mb-20 w-full h-full rounded-xl shadow overflow-hidden">
      <div className=" h-[90%] overflow-auto">
        <table className="text-gray-800 max-h-full border-separate border-spacing-0 bg-white bg-opacity-20 backdrop-filter w-full z-0">
          <thead className="bg-black h-20 mt-0">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr
                key={headerGroup.id}
                className="hover:bg-gray hover:backdrop-filter"
              >
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="hover:text-gray-800 text-center font-extrabold text-white text-lg"
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
                className="text-center hover:text-black hover:bg-gray hover:backdrop-filter hover:backdrop-blur-lg items-center"
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
      <div className="w-full flex justify-end ">
        <Button
          className="font-bold text-xl rounded-xl"
          onClick={() => {
            table.previousPage();
          }}
          disabled={!table.getCanPreviousPage()}
        >
          {"<"}
        </Button>
        <Button
          className="font-bold text-xl rounded-xl"
          onClick={() => {
            table.nextPage();
          }}
          disabled={!table.getCanNextPage()}
        >
          {">"}
        </Button>
        {/* Modal para borrar */}
      </div>
      {productToEdit && openDeleteModal && (
        <Modal
          className="z-50 absolute"
          blockButton={false}
          onCancel={() => setOpenDeleteModal(false)}
          visible={openDeleteModal}
          key={productToEdit.id}
          onClose={() => setOpenDeleteModal(false)}
          onAcept={async () => {
            console.log(productToEdit);
            if (productToEdit.image !== "") {
              // Ejemplo: borra la imagen en storage (asegúrate de tener importadas las funciones necesarias)
              const fileRef = ref(storage, `${productToEdit.image}`);
              await deleteObject(fileRef);
            }
            await deleteDoc(doc(db, "stock", productToEdit.id));
            setOpenDeleteModal(false);
          }}
          message="¿Seguro que desea eliminar este producto?"
        />
      )}

      {/* Modal para editar */}
      {productToEdit && openEditModal && (
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

export default ProductDataTable;
