"use client";

import { memo, useState } from "react";
import Link from "next/link";
import { Minus, Plus, ShoppingCart } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { PublicProduct } from "@/actions/catalog";
import { cn } from "@/lib/utils";
import { ProductVisual } from "./ProductVisual";
import { formatCurrency, formatUnit } from "./catalog-format";

interface ProductCardProps {
  product: PublicProduct;
  cartQuantity: number;
  onAddToCart: (product: PublicProduct, quantity: number) => void;
  businessSlug: string;
  priority?: boolean;
}

function stockLabel(amount: number) {
  if (amount <= 0) return "Sin stock";
  if (amount <= 5) return `Últimas ${amount}`;
  return "Disponible";
}

const ProductCard = memo(function ProductCard({
  product,
  cartQuantity,
  onAddToCart,
  businessSlug,
  priority = false,
}: ProductCardProps) {
  const [quantity, setQuantity] = useState(() => (product.amount > 0 ? 1 : 0));
  const detailHref = `/${businessSlug}/catalogo/${product.id}`;
  const hasStock = product.amount > 0;
  const remainingStock = Math.max(0, product.amount - cartQuantity);
  const safeQuantity = Math.min(quantity, remainingStock);
  const reachedLimit = hasStock && remainingStock === 0;
  const disabled = !hasStock || reachedLimit || safeQuantity <= 0;
  const stock = stockLabel(product.amount);

  const handleAdd = () => {
    if (disabled) return;
    onAddToCart(product, safeQuantity);
    const remainingAfterAdd = remainingStock - safeQuantity;
    setQuantity(remainingAfterAdd > 0 ? 1 : 0);
  };

  return (
    <article
      aria-label={product.description ?? "Producto"}
      className="group relative flex min-w-0 flex-col overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm motion-safe:transition-[transform,box-shadow] motion-safe:duration-300 motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-lg focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
    >
      <Link
        href={detailHref}
        className="absolute inset-0 z-10 rounded-3xl outline-none"
        aria-label={`Ver detalle de ${product.description ?? "producto"}`}
      >
        <span className="sr-only">Ver detalle</span>
      </Link>

      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        <ProductVisual
          image={product.image}
          images={product.images}
          description={product.description}
          category={product.category}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          priority={priority}
          className="motion-safe:transition-transform motion-safe:duration-500 motion-safe:group-hover:scale-105"
        />

        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start gap-2 bg-linear-to-b from-black/25 to-transparent p-3">
          <div className="flex min-w-0 flex-wrap gap-2">
            {product.category && (
              <span className="max-w-40 truncate rounded-full bg-background/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-foreground shadow-sm backdrop-blur-sm">
                {product.category}
              </span>
            )}
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-[10px] font-bold shadow-sm backdrop-blur-sm",
                !hasStock
                  ? "bg-red-600/90 text-white"
                  : product.amount <= 5
                    ? "bg-amber-500/95 text-amber-950"
                    : "bg-emerald-600/90 text-white",
              )}
            >
              {stock}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              {product.brand || "Genérico"}
            </p>
            {cartQuantity > 0 && (
              <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                {cartQuantity} en carrito
              </span>
            )}
          </div>
          <h3 className="min-h-10 text-sm font-semibold leading-snug text-card-foreground">
            <span className="line-clamp-2">{product.description ?? "Producto sin descripción"}</span>
          </h3>
        </div>

        <div className="mt-auto space-y-3">
          <div className="flex items-end justify-between gap-2">
            <p className="text-xl font-black tabular-nums tracking-tight text-foreground">
              {formatCurrency(product.salePrice)}
            </p>
            <span className="pb-0.5 text-xs font-medium text-muted-foreground">
              por {formatUnit(product.unit)}
            </span>
          </div>

          <div className="relative z-20 space-y-2">
            <div className="flex items-center justify-between gap-2 rounded-xl border bg-muted/40 p-1 pl-3">
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                Cantidad
              </span>
              <div className="flex items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 touch-manipulation rounded-lg"
                  onClick={() => setQuantity(Math.max(0, safeQuantity - 1))}
                  disabled={safeQuantity <= 0}
                  aria-label={`Disminuir cantidad de ${product.description ?? "producto"}`}
                >
                  <Minus className="size-3.5" aria-hidden="true" />
                </Button>
                <Input
                  type="number"
                  inputMode="numeric"
                  name={`quantity-${product.id}`}
                  value={safeQuantity > 0 ? safeQuantity : ""}
                  placeholder="0"
                  autoComplete="off"
                  aria-label={`Cantidad de ${product.description ?? "producto"}`}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (Number.isFinite(value) && value >= 0 && value <= remainingStock) {
                      setQuantity(value);
                    }
                  }}
                  className="h-8 w-10 border-none bg-transparent p-0 text-center text-sm font-bold tabular-nums focus-visible:ring-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 touch-manipulation rounded-lg"
                  onClick={() => setQuantity(Math.min(remainingStock, safeQuantity + 1))}
                  disabled={safeQuantity >= remainingStock}
                  aria-label={`Aumentar cantidad de ${product.description ?? "producto"}`}
                >
                  <Plus className="size-3.5" aria-hidden="true" />
                </Button>
              </div>
            </div>

            <Button
              type="button"
              onClick={handleAdd}
              disabled={disabled}
              className="h-10 w-full min-w-0 touch-manipulation rounded-xl bg-primary px-3 font-semibold text-primary-foreground shadow-sm motion-safe:transition-colors motion-safe:duration-200 hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground"
              aria-label={`Agregar ${product.description ?? "producto"} al carrito`}
            >
              <ShoppingCart className="size-4" aria-hidden="true" />
              <span className="truncate">
                {!hasStock
                  ? "Sin stock"
                  : reachedLimit
                    ? "Máximo en carrito"
                    : safeQuantity <= 0
                      ? "Elegí cantidad"
                      : `Agregar · ${formatCurrency(product.salePrice * safeQuantity)}`}
              </span>
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
});

export default ProductCard;
