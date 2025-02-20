import { ColumnDef } from "@tanstack/react-table";
import Image from "next/image";
import DeleteButton from "../DeleteButton";
import CodeBarModal from "./code-bar-modal";
import Product from "@/models/Product";

export const columns: ColumnDef<Product>[] = [
  {
    accessorKey: "code",
    header: "Código",
  },
  {
    accessorKey: "description",
    header: "Descripción",
  },
  {
    accessorKey: "amount",
    header: "Cantidad",
  },
  {
    accessorKey: "unit",
    header: "Unidad",
  },
  {
    accessorKey: "salePrice",
    header: "Precio de Venta",
    cell: ({ row }) => (
      <>
        $
        {Number(row.getValue("salePrice")).toLocaleString("es-AR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
      </>
    ),
  },
  {
    accessorKey: "color",
    header: "Color",
  },
  {
    accessorKey: "peso",
    header: "Peso",
  },
  {
    accessorKey: "medidas",
    header: "Medidas",
  },
  {
    accessorKey: "image",
    header: "Foto",
    cell: ({ row }) => (
      <Image
        className="rounded-lg mx-auto"
        src={"/no-image.svg"}
        alt="Imagen"
        height={70}
        width={75}
      />
    ),
  },
  {
    accessorKey: "actions",
    header: "Acciones",
    cell: ({ row }) => (
      <div className="flex gap-2">
        <DeleteButton disable={false} id={row.original.id} onClick={() => {}} />
        <CodeBarModal value={row.original.code} />
      </div>
    ),
  },
];
