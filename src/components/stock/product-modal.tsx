"use client";

import { ReactNode } from "react";
import Product from "@/models/Product";
import JsBarcode from "jsbarcode";
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
            {(() => {
              const imageUrl = product.images?.[0] || product.image;
              return imageUrl && imageUrl.includes("https") ? (
                <Image
                  className="mx-auto rounded-lg max-h-64 object-contain"
                  src={imageUrl}
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
              );
            })()}
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
            {product.codebar && (
              <>
                <div className="border-t border-gray-100 dark:border-gray-800 my-2" />
                <div>
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Código de Barras
                  </span>
                  <p className="text-sm font-mono text-gray-700 dark:text-gray-300 mt-1">
                    {product.codebar}
                  </p>
                  <div className="mt-2 flex justify-center bg-white rounded-lg p-3 border border-gray-100">
                    <svg
                      ref={(el) => {
                        if (el && product.codebar) {
                          try {
                            JsBarcode(el, product.codebar, {
                              format: "CODE128",
                              lineColor: "#000000",
                              width: 2,
                              height: 50,
                              displayValue: false,
                              margin: 0,
                            });
                          } catch {
                            // silently ignore
                          }
                        }
                      }}
                      className="w-full max-w-[220px]"
                    />
                  </div>
                </div>
              </>
            )}
            {product.details && (
              <CardDescription>
                <strong>Detalles:</strong> {product.details}
              </CardDescription>
            )}
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
