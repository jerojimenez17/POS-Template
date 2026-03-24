"use client";

import { memo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import Image from "next/image";
import noImgPhoto from "../../../public/no-image.svg";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { PublicProduct } from "@/actions/catalog";
import { ShoppingCart, Plus, Minus, Info } from "lucide-react";
import { Badge } from "../ui/badge";
import { cn } from "@/lib/utils";

interface ProductCardProps {
  product: PublicProduct;
  isCatalog: boolean;
  unitsToOrder: { id: string; amount: number };
  onQuantityChange: (id: string, amount: number) => void;
  onAddToCart: (product: PublicProduct, quantity: number) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ProductModal: any;
}

const ProductCard = memo(function ProductCard({
  product,
  isCatalog,
  unitsToOrder,
  onQuantityChange,
  onAddToCart,
  ProductModal,
}: ProductCardProps) {
  const quantity = unitsToOrder.id === product.id ? unitsToOrder.amount : 0;
  const isDisabled = product.id !== unitsToOrder.id || unitsToOrder.amount === 0;

  return (
    <Card
      className="group flex flex-col overflow-hidden hover:shadow-2xl transition-all duration-300 bg-white dark:bg-gray-800/50 backdrop-blur-sm border-gray-100 dark:border-gray-700 w-72 h-full focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 rounded-3xl"
      key={product.id}
    >
      <div className="relative aspect-square overflow-hidden bg-gray-50 dark:bg-gray-900/50">
        <ProductModal product={product}>
          <div className="cursor-pointer h-full w-full group/image">
            {product.image && product.image.includes("https") ? (
              <Image
                className="object-cover w-full h-full transition-transform duration-500 group-hover/image:scale-110"
                src={product.image}
                width={400}
                height={400}
                alt={`Imagen de ${product.description ?? "producto"}`}
                loading="lazy"
              />
            ) : (
              <div className="flex items-center justify-center h-full w-full opacity-40">
                <Image
                  className="w-24 h-24"
                  src={noImgPhoto}
                  alt="Imagen no disponible"
                  height={100}
                  width={100}
                />
              </div>
            )}
            <div className="absolute inset-0 bg-black/0 group-hover/image:bg-black/10 transition-colors duration-300 flex items-center justify-center opacity-0 group-hover/image:opacity-100">
              <div className="bg-white/90 dark:bg-black/90 p-2 rounded-full shadow-lg transform translate-y-4 group-hover/image:translate-y-0 transition-transform duration-300 text-primary">
                <Info className="w-5 h-5" />
              </div>
            </div>
          </div>
        </ProductModal>
        
        {/* Badges */}
        <div className="absolute top-3 left-3 flex flex-col gap-2">
          {product.category && (
            <Badge variant="secondary" className="bg-white/80 dark:bg-black/60 backdrop-blur-md text-[10px] uppercase tracking-wider font-bold border-none shadow-sm">
              {product.category}
            </Badge>
          )}
        </div>
        
        <div className="absolute bottom-3 right-3 text-xs font-bold bg-white/90 dark:bg-black/80 px-2 py-1 rounded-lg shadow-sm backdrop-blur-sm">
          {product.code && <span className="opacity-60 mr-1">#</span>}
          {product.code || "S/C"}
        </div>
      </div>

      <CardHeader className="p-5 pb-2">
        <div className="flex justify-between items-start gap-2">
          <CardTitle className="text-lg font-bold leading-tight line-clamp-2 min-h-12" title={product.description ?? undefined}>
            {product.description ?? "Sin descripción"}
          </CardTitle>
        </div>
        <div className="flex items-baseline gap-1 mt-1">
          <span className="text-2xl font-black text-primary">
            ${product.salePrice.toLocaleString("es-AR", { minimumFractionDigits: 0 })}
          </span>
          <span className="text-xs text-muted-foreground font-medium uppercase">
            {product.unit || "un"}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-1">
           <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">{product.brand || "Generico"}</span>
        </div>
      </CardHeader>

      <CardContent className="p-5 pt-2 mt-auto">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3 bg-gray-50 dark:bg-gray-900/50 p-1 rounded-2xl border border-gray-100 dark:border-gray-800">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-xl shrink-0"
              onClick={() => onQuantityChange(product.id, Math.max(0, quantity - 1))}
              disabled={quantity <= 0}
            >
              <Minus className="h-4 w-4" />
            </Button>
            
            <Input
              type="number"
              className="h-8 border-none bg-transparent text-center font-bold text-sm focus-visible:ring-0 p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              placeholder="0"
              value={quantity > 0 ? quantity : ""}
              onChange={(e) => {
                const value = Number(e.target.value);
                if (value >= 0 && (!product.amount || value <= product.amount)) {
                  onQuantityChange(product.id, value);
                }
              }}
            />
            
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-xl shrink-0"
              onClick={() => onQuantityChange(product.id, quantity + 1)}
              disabled={product.amount > 0 && quantity >= product.amount}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <Button
            onClick={() => onAddToCart(product, quantity)}
            disabled={isDisabled}
            className={cn(
              "w-full rounded-2xl h-11 font-bold transition-all duration-300 flex items-center justify-center gap-2",
              isDisabled ? "bg-gray-100 dark:bg-gray-800 text-gray-400" : "bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 scale-100 hover:scale-[1.02]"
            )}
            aria-label={`Agregar ${product.description} al carrito`}
          >
            <ShoppingCart className="w-4 h-4" />
            <span>Agregar al pedido</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
});

export default ProductCard;