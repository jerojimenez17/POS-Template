"use client";

import { useContext, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  ShoppingCart,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { PublicProduct } from "@/actions/catalog";
import { CartContext } from "./context/CartContext";
import Product from "@/models/Product";
import { ProductVisual } from "./ProductVisual";
import { formatCurrency, formatUnit } from "./catalog-format";
import { cn } from "@/lib/utils";

interface Props {
  product: PublicProduct;
  businessSlug: string;
  businessName?: string;
}

function buildImages(product: PublicProduct) {
  if (product.images.length > 0) return product.images;
  if (product.image) return [product.image];
  return [];
}

export function ProductDetail({ product, businessSlug, businessName }: Props) {
  const images = buildImages(product);
  const { cartState, addItem } = useContext(CartContext);
  const [quantity, setQuantity] = useState(() => (product.amount > 0 ? 1 : 0));
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const cartQuantity = (cartState.products ?? []).find((item) => item.id === product.id)?.amount ?? 0;
  const remainingStock = Math.max(0, product.amount - cartQuantity);
  const safeQuantity = Math.min(quantity, remainingStock);
  const hasStock = product.amount > 0;
  const reachedCartLimit = hasStock && remainingStock === 0;
  const canAdd = hasStock && remainingStock > 0 && safeQuantity > 0;
  const detailUnit = formatUnit(product.unit);
  const stockText = !hasStock
    ? "Sin stock"
    : product.amount <= 5
      ? `Últimas ${product.amount} unidades`
      : "Disponible";

  const handleAddToCart = () => {
    if (!canAdd) return;
    const cartProduct = new Product();
    cartProduct.id = product.id;
    cartProduct.code = product.code ?? "";
    cartProduct.description = product.description ?? "";
    cartProduct.brand = product.brand ?? "";
    cartProduct.category = product.category ?? "";
    cartProduct.salePrice = product.salePrice;
    cartProduct.unit = product.unit ?? "unidades";
    cartProduct.image = product.image ?? product.images?.[0] ?? "";
    cartProduct.images = product.images ?? [];
    cartProduct.amount = safeQuantity;
    cartProduct.price = product.salePrice;
    cartProduct.subCategory = "";
    cartProduct.gain = 0;
    cartProduct.client_bonus = 0;
    cartProduct.imageName = "";
    cartProduct.last_update = new Date();
    cartProduct.creation_date = new Date();
    addItem(cartProduct);
    toast.success("Producto agregado al carrito", {
      description: product.description ?? undefined,
      position: "top-center",
    });
    const remainingAfterAdd = remainingStock - safeQuantity;
    setQuantity(remainingAfterAdd > 0 ? 1 : 0);
  };

  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link
            href={`/${businessSlug}/catalogo`}
            className="group inline-flex min-w-0 items-center gap-2 rounded-full text-sm font-semibold text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="size-4 shrink-0 motion-safe:transition-transform motion-safe:group-hover:-translate-x-0.5" aria-hidden="true" />
            <span className="truncate">Volver al catálogo</span>
          </Link>
          {businessName && (
            <span className="truncate text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
              {businessName}
            </span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-12">
          <section aria-label="Imágenes del producto" className="space-y-3">
            <div className="relative aspect-square overflow-hidden rounded-3xl border bg-muted shadow-sm">
              <ProductVisual
                image={images[currentImageIndex] ?? product.image}
                images={[]}
                description={product.description}
                category={product.category}
                sizes="(max-width: 1024px) 100vw, 50vw"
                priority
              />

              {images.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => setCurrentImageIndex((index) => (index - 1 + images.length) % images.length)}
                    className="absolute left-3 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 text-foreground shadow-lg backdrop-blur-sm outline-none transition-colors hover:bg-background focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Imagen anterior"
                  >
                    <ChevronLeft className="size-5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentImageIndex((index) => (index + 1) % images.length)}
                    className="absolute right-3 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 text-foreground shadow-lg backdrop-blur-sm outline-none transition-colors hover:bg-background focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Siguiente imagen"
                  >
                    <ChevronRight className="size-5" aria-hidden="true" />
                  </button>
                  <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
                    {images.map((_, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => setCurrentImageIndex(index)}
                        className={cn(
                          "h-2 rounded-full outline-none transition-[width,background-color] focus-visible:ring-2 focus-visible:ring-ring",
                          index === currentImageIndex
                            ? "w-5 bg-primary"
                            : "w-2 bg-background/80 hover:bg-background",
                        )}
                        aria-label={`Imagen ${index + 1}`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>

            {images.length > 1 && (
              <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {images.map((image, index) => (
                  <button
                    key={image}
                    type="button"
                    onClick={() => setCurrentImageIndex(index)}
                    className={cn(
                      "relative size-20 shrink-0 overflow-hidden rounded-2xl border-2 bg-muted outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                      index === currentImageIndex
                        ? "border-primary"
                        : "border-transparent hover:border-border",
                    )}
                    aria-label={`Ver imagen ${index + 1}`}
                    aria-pressed={index === currentImageIndex}
                  >
                    <ProductVisual
                      image={image}
                      images={[]}
                      description={product.description}
                      category={product.category}
                      sizes="80px"
                      showLabel={false}
                    />
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="flex flex-col gap-6" aria-label="Información del producto">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {product.category && (
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-primary">
                    {product.category}
                  </span>
                )}
                {product.brand && (
                  <span className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
                    {product.brand}
                  </span>
                )}
              </div>

              <h1 className="text-balance text-3xl font-black leading-tight tracking-tight text-foreground sm:text-4xl">
                {product.description ?? "Producto sin descripción"}
              </h1>

              <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
                <span className="text-4xl font-black tabular-nums tracking-tight text-primary">
                  {formatCurrency(product.salePrice)}
                </span>
                <span className="pb-1 text-sm font-medium text-muted-foreground">
                  por {detailUnit}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full px-3 py-1 font-semibold",
                    !hasStock
                      ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                      : product.amount <= 5
                        ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                        : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
                  )}
                >
                  <span
                    className={cn(
                      "size-2 rounded-full",
                      !hasStock ? "bg-red-500" : product.amount <= 5 ? "bg-amber-500" : "bg-emerald-500",
                    )}
                    aria-hidden="true"
                  />
                  {stockText}
                </span>
                {cartQuantity > 0 && (
                  <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
                    {cartQuantity} en tu carrito
                  </span>
                )}
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-3 rounded-2xl border bg-muted/30 p-4 text-sm">
              <div className="min-w-0">
                <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Categoría</dt>
                <dd className="mt-1 truncate font-semibold text-foreground">{product.category ?? "Sin categoría"}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Marca</dt>
                <dd className="mt-1 truncate font-semibold text-foreground">{product.brand ?? "Genérico"}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Unidad de venta</dt>
                <dd className="mt-1 truncate font-semibold text-foreground">{detailUnit}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Disponibilidad</dt>
                <dd className="mt-1 truncate font-semibold text-foreground">{stockText}</dd>
              </div>
            </dl>

            {product.details && (
              <div className="rounded-2xl border bg-card p-5">
                <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Detalle</h2>
                <p className="mt-2 whitespace-pre-line text-pretty text-sm leading-relaxed text-card-foreground">
                  {product.details}
                </p>
              </div>
            )}

            <div className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-card-foreground">Cantidad</p>
                  <p className="text-xs text-muted-foreground">
                    {remainingStock > 0
                      ? `Podés agregar hasta ${remainingStock} ${detailUnit === "unidad" ? "unidad" : detailUnit}.`
                      : "Ya tenés todo el stock disponible en el carrito."}
                  </p>
                </div>
                <div className="flex items-center gap-1 rounded-xl border bg-background p-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-9 rounded-lg"
                    onClick={() => setQuantity(Math.max(0, safeQuantity - 1))}
                    disabled={safeQuantity <= 0}
                    aria-label="Disminuir cantidad"
                  >
                    <Minus className="size-4" aria-hidden="true" />
                  </Button>
                  <Input
                    type="number"
                    name="quantity"
                    inputMode="numeric"
                    className="h-9 w-14 border-none bg-transparent p-0 text-center font-bold tabular-nums focus-visible:ring-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    value={safeQuantity > 0 ? safeQuantity : ""}
                    placeholder="0"
                    autoComplete="off"
                    aria-label="Cantidad del producto"
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (Number.isFinite(value) && value >= 0 && value <= remainingStock) {
                        setQuantity(value);
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-9 rounded-lg"
                    onClick={() => setQuantity(Math.min(remainingStock, safeQuantity + 1))}
                    disabled={safeQuantity >= remainingStock}
                    aria-label="Aumentar cantidad"
                  >
                    <Plus className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>

              <Button
                type="button"
                onClick={handleAddToCart}
                disabled={!canAdd}
                className="mt-4 h-12 w-full touch-manipulation gap-2 rounded-xl text-base font-bold shadow-sm motion-safe:transition-colors motion-safe:duration-200"
              >
                <ShoppingCart className="size-5" aria-hidden="true" />
                {!hasStock
                  ? "Sin stock"
                  : reachedCartLimit
                    ? "Máximo en carrito"
                    : safeQuantity <= 0
                      ? "Elegí una cantidad"
                      : `Agregar al carrito · ${formatCurrency(product.salePrice * safeQuantity)}`}
              </Button>
            </div>

            <Link
              href={`/${businessSlug}/catalogo`}
              className="inline-flex w-fit items-center gap-2 rounded-full text-sm font-semibold text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Seguir comprando
            </Link>
          </section>
        </div>
      </main>
    </div>
  );
}
