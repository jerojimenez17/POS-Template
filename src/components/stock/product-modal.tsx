"use client";

import { ReactNode } from "react";
import Product from "@/models/Product";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "../ui/dialog";
import Image from "next/image";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "../ui/card";

interface ProductModalProps {
  product: Product;
  children: ReactNode;
}

export function ProductModal({ product, children }: ProductModalProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            {product.description}
          </DialogTitle>
          <DialogDescription>
            Código: {product.code} | Marca: {product.brand}
          </DialogDescription>
        </DialogHeader>
        <Card className="border-0 shadow-none">
          <CardHeader className="p-0">
            {product.image && product.image.includes("https")  ? (
              <Image
                className="mx-auto rounded-lg max-h-64 object-contain"
                src={product.image}
                width={400}
                height={300}
                alt={product.description}
              />
            ) : (
              <Image
                className="mx-auto rounded-lg max-h-64 object-contain"
                src={"/no-image.svg"}
                width={400}
                height={300}
                alt="Sin imagen"
              />
            )}
          </CardHeader>
          <CardContent className="p-0 mt-4 space-y-2">
            <CardDescription className="text-lg font-semibold">
              Precio de Venta:{" "}
              <span className="text-blue-500">
                ${product.salePrice.toLocaleString("es-AR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </CardDescription>
            <CardDescription>
              <strong>Categoría:</strong> {product.category}
            </CardDescription>
            <CardDescription>
              <strong>Subcategoría:</strong> {product.subCategory}
            </CardDescription>
            <CardDescription>
              <strong>Stock disponible:</strong>{" "}
              {product.amount > 0 ? (
                <span className="text-green-600">{product.amount}</span>
              ) : (
                <span className="text-red-600">Sin stock</span>
              )}
            </CardDescription>
            <CardDescription>
              <strong>Unidad:</strong> {product.unit}
            </CardDescription>
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
