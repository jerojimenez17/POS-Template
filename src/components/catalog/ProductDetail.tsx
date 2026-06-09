"use client";

import { useState, useContext } from "react";
import Image from "next/image";
import Link from "next/link";
import noImgPhoto from "../../../public/no-image.svg";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { PublicProduct } from "@/actions/catalog";
import { CartContext } from "./context/CartContext";
import Product from "@/models/Product";
import { ShoppingCart, Plus, Minus, ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  product: PublicProduct;
  businessSlug: string;
}

export function ProductDetail({ product, businessSlug }: Props) {
  const [quantity, setQuantity] = useState(0);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const { addItem } = useContext(CartContext);

  const images = product.image && product.image.includes("https")
    ? [product.image]
    : [];

  const handleAddToCart = () => {
    if (quantity <= 0) return;
    const cartProduct = new Product();
    cartProduct.id = product.id;
    cartProduct.code = product.code ?? "";
    cartProduct.description = product.description ?? "";
    cartProduct.brand = product.brand ?? "";
    cartProduct.category = product.category ?? "";
    cartProduct.salePrice = product.salePrice;
    cartProduct.unit = product.unit ?? "unidades";
    cartProduct.image = product.image ?? "";
    cartProduct.amount = quantity;
    cartProduct.price = product.salePrice;
    cartProduct.subCategory = "";
    cartProduct.gain = 0;
    cartProduct.client_bonus = 0;
    cartProduct.imageName = "";
    cartProduct.last_update = new Date();
    cartProduct.creation_date = new Date();
    addItem(cartProduct);
    setQuantity(0);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-gray-900">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <Link
          href={`/${businessSlug}/catalogo`}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors mb-6 group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Volver al catálogo
        </Link>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
          {/* Image gallery */}
          <div className="space-y-4">
            <div className="relative aspect-square rounded-2xl overflow-hidden bg-gray-100 dark:bg-gray-800 shadow-xl">
              {images.length > 0 ? (
                <>
                  <Image
                    src={images[currentImageIndex]}
                    alt={`Imagen de ${product.description ?? "producto"}`}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 50vw"
                    priority
                  />
                  {images.length > 1 && (
                    <>
                      <button
                        onClick={() => setCurrentImageIndex((i) => (i - 1 + images.length) % images.length)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 bg-white/80 dark:bg-black/60 hover:bg-white dark:hover:bg-black/80 rounded-full p-2 shadow-lg transition-all"
                        aria-label="Imagen anterior"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => setCurrentImageIndex((i) => (i + 1) % images.length)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/80 dark:bg-black/60 hover:bg-white dark:hover:bg-black/80 rounded-full p-2 shadow-lg transition-all"
                        aria-label="Siguiente imagen"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                        {images.map((_, i) => (
                          <button
                            key={i}
                            onClick={() => setCurrentImageIndex(i)}
                            className={`w-2 h-2 rounded-full transition-all ${
                              i === currentImageIndex
                                ? "bg-white w-4"
                                : "bg-white/50 hover:bg-white/80"
                            }`}
                            aria-label={`Imagen ${i + 1}`}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-center h-full opacity-40">
                  <Image
                    src={noImgPhoto}
                    alt="Imagen no disponible"
                    width={200}
                    height={200}
                    className="object-contain"
                  />
                </div>
              )}
            </div>
            {images.length > 1 && (
              <div className="flex gap-3 overflow-x-auto pb-2">
                {images.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentImageIndex(i)}
                    className={`relative w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 border-2 transition-all ${
                      i === currentImageIndex
                        ? "border-primary ring-2 ring-primary/20"
                        : "border-transparent hover:border-gray-300 dark:hover:border-gray-600"
                    }`}
                  >
                    <Image
                      src={img}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="80px"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Product info */}
          <div className="flex flex-col gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {product.category && (
                  <Badge variant="secondary" className="bg-primary/10 text-primary border-none rounded-full text-xs uppercase tracking-wider font-bold">
                    {product.category}
                  </Badge>
                )}
                {product.brand && (
                  <span className="text-xs text-muted-foreground font-bold uppercase tracking-widest">
                    {product.brand}
                  </span>
                )}
              </div>

              <h1 className="text-3xl font-black leading-tight text-foreground">
                {product.description ?? "Sin descripción"}
              </h1>

              {product.code && (
                <p className="text-sm text-muted-foreground mt-2 font-mono">
                  <span className="opacity-60">#</span>{product.code}
                </p>
              )}
            </div>

            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-black text-primary">
                ${product.salePrice.toLocaleString("es-AR", { minimumFractionDigits: 0 })}
              </span>
              <span className="text-base text-muted-foreground font-medium uppercase">
                {product.unit || "un"}
              </span>
            </div>

            {product.amount > 0 ? (
              <div className="flex items-center gap-2 text-sm font-medium">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-emerald-600 dark:text-emerald-400">En stock</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm font-medium">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-red-600 dark:text-red-400">Sin stock</span>
              </div>
            )}

            {product.details && (
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2">Detalles</h3>
                <p className="text-base text-foreground/80 leading-relaxed whitespace-pre-line">
                  {product.details}
                </p>
              </div>
            )}

            {/* Quantity + Add to cart */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6 mt-auto">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-sm font-bold text-muted-foreground">Cantidad</span>
                <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl border border-gray-200 dark:border-gray-700">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 rounded-lg"
                    onClick={() => setQuantity(Math.max(0, quantity - 1))}
                    disabled={quantity <= 0}
                    aria-label="Disminuir cantidad"
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Input
                    type="number"
                    className="h-10 w-20 border-none bg-transparent text-center font-bold text-base focus-visible:ring-0 p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    placeholder="0"
                    value={quantity > 0 ? quantity : ""}
                    autoComplete="off"
                    aria-label="Cantidad del producto"
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (val >= 0 && (!product.amount || val <= product.amount)) {
                        setQuantity(val);
                      }
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 rounded-lg"
                    onClick={() => setQuantity(quantity + 1)}
                    disabled={product.amount > 0 && quantity >= product.amount}
                    aria-label="Aumentar cantidad"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <Button
                onClick={handleAddToCart}
                disabled={quantity <= 0}
                className="w-full h-14 text-lg font-bold rounded-2xl gap-3 shadow-xl shadow-primary/20 hover:shadow-2xl hover:shadow-primary/30 transition-all disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400"
              >
                <ShoppingCart className="w-5 h-5" />
                {quantity > 0
                  ? `Agregar al pedido — $${(product.salePrice * quantity).toLocaleString("es-AR", { minimumFractionDigits: 0 })}`
                  : "Agregar al pedido"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
