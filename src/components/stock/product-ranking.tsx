"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import getProductsRanking, {
  RankedProduct,
} from "@/firebase/stock/getProductsRanking";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";

const ProductRanking = () => {
  const searchParams = useSearchParams();
  const month = searchParams.get("month") || ""; // ej: "2025-5"

  const [products, setProducts] = useState<RankedProduct[]>([]);

  useEffect(() => {
    if (!month) return;

    const fetchRanking = async () => {
      const data = await getProductsRanking(month);
      setProducts(data);
    };

    fetchRanking();
  }, [month]);

  return (
    <div className="text-slate-900 bg-white h-full flex flex-wrap pb-9 pt-3 px-4 my-auto w-full overflow-auto">
      <Table className="items-center">
        <TableHeader>
          <TableRow className="items-center">
            <TableHead className="text-center">Código</TableHead>
            <TableHead className="text-center">Producto</TableHead>
            <TableHead className="text-center">Cantidad vendida</TableHead>
            <TableHead className="text-center">Precio</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="items-center">
          {products.map((product) => (
            <TableRow key={product.id} className="items-center">
              <TableCell className="text-center">{product.code}</TableCell>
              <TableCell className="text-center">{product.nombre}</TableCell>
              <TableCell className="text-center">{product.ventas}</TableCell>
              <TableCell className="text-center">${product.price}</TableCell>
              {/* Podés hacer un fetch al producto real si querés mostrar precio real */}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default ProductRanking;
