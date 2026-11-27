"use client";

import { useContext, useDeferredValue, useMemo, useState } from "react";
import Image from "next/image";
import { Search, SearchX, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import ProductCard from "./ProductCard";
import { CartContext } from "./context/CartContext";
import { PublicProduct } from "@/actions/catalog";
import Product from "@/models/Product";
import { cn } from "@/lib/utils";

interface Props {
  products?: PublicProduct[];
  business: {
    name: string;
    logo: string | null;
  };
  businessSlug: string;
}

const normalizeText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-AR")
    .trim();

const chipBase =
  "inline-flex h-9 shrink-0 touch-manipulation items-center rounded-full border px-4 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
const chipIdle = "border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground";
const chipActive = "border-primary bg-primary text-primary-foreground shadow-sm";
const PAGE_SIZE = 24;

const ProductSelector = ({ products = [], business, businessSlug }: Props) => {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const { cartState, addItem } = useContext(CartContext);
  const deferredSearch = useDeferredValue(search);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const product of products) {
      if (!product.category) continue;
      counts.set(product.category, (counts.get(product.category) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort(([left], [right]) => left.localeCompare(right, "es"))
      .map(([name, count]) => ({ name, count }));
  }, [products]);

  const filteredProducts = useMemo(() => {
    const query = normalizeText(deferredSearch);
    return products.filter((product) => {
      const matchesCategory = category === "all" || product.category === category;
      if (!matchesCategory) return false;
      if (!query) return true;
      return normalizeText(
        [product.description, product.brand, product.category, product.code]
          .filter(Boolean)
          .join(" "),
      ).includes(query);
    });
  }, [products, deferredSearch, category]);

  const cartQuantities = useMemo(
    () => new Map((cartState.products ?? []).map((product) => [product.id, product.amount])),
    [cartState.products],
  );

  const visibleProducts = filteredProducts.slice(0, visibleCount);
  const hasMore = visibleCount < filteredProducts.length;
  const hasFilters = search.trim().length > 0 || category !== "all";

  const clearFilters = () => {
    setSearch("");
    setCategory("all");
    setVisibleCount(PAGE_SIZE);
  };

  const handleAddToCart = (publicProduct: PublicProduct, quantity: number) => {
    const product = new Product();
    product.id = publicProduct.id;
    product.code = publicProduct.code ?? "";
    product.description = publicProduct.description ?? "";
    product.brand = publicProduct.brand ?? "";
    product.category = publicProduct.category ?? "";
    product.salePrice = publicProduct.salePrice;
    product.unit = publicProduct.unit ?? "unidades";
    product.image = publicProduct.image ?? publicProduct.images?.[0] ?? "";
    product.images = publicProduct.images ?? [];
    product.amount = quantity;
    product.price = publicProduct.salePrice;
    product.subCategory = "";
    product.gain = 0;
    product.client_bonus = 0;
    product.imageName = "";
    product.last_update = new Date();
    product.creation_date = new Date();
    addItem(product);
    toast.success("Producto agregado al carrito", {
      description: publicProduct.description ?? undefined,
      position: "top-center",
    });
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background pb-28">
      <header className="relative overflow-hidden border-b bg-linear-to-br from-primary/10 via-background to-amber-50/80 dark:from-primary/10 dark:via-background dark:to-slate-900">
        <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -left-24 bottom-0 size-64 rounded-full bg-amber-300/20 blur-3xl dark:bg-amber-500/10" />
        <div className="relative mx-auto flex max-w-7xl flex-col gap-5 px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <div className="flex items-center gap-4">
            {business.logo ? (
              <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl border border-white/60 bg-background/80 p-2 shadow-sm backdrop-blur-sm dark:border-white/10">
                <Image
                  src={business.logo}
                  alt={`Logo de ${business.name}`}
                  width={64}
                  height={64}
                  priority
                  className="h-full w-full object-contain"
                />
              </div>
            ) : (
              <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-primary to-primary/70 text-2xl font-black text-primary-foreground shadow-lg shadow-primary/20">
                {business.name.trim().charAt(0).toUpperCase() || "C"}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                Catálogo online
              </p>
              <h1 className="text-balance text-3xl font-black tracking-tight text-foreground sm:text-4xl">
                {business.name}
              </h1>
            </div>
          </div>
          <p className="max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
            Elegí tus productos, sumalos al carrito y coordiná tu pedido.
          </p>
        </div>
      </header>

      <div className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                name="catalog-search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setVisibleCount(PAGE_SIZE);
                }}
                placeholder="Buscar producto, marca o categoría…"
                aria-label="Buscar productos"
                autoComplete="off"
                spellCheck={false}
                className="h-12 rounded-2xl border-border/80 bg-background pl-11 pr-11 text-base shadow-sm focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-search-cancel-button]:appearance-none"
              />
              {search.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setVisibleCount(PAGE_SIZE);
                  }}
                  className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Limpiar búsqueda"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              )}
            </div>

            <div
              className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              role="group"
              aria-label="Filtrar por categoría"
            >
              <button
                type="button"
                onClick={() => {
                  setCategory("all");
                  setVisibleCount(PAGE_SIZE);
                }}
                aria-pressed={category === "all"}
                className={cn(chipBase, category === "all" ? chipActive : chipIdle)}
              >
                Todos
              </button>
              {categories.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => {
                    setCategory(item.name);
                    setVisibleCount(PAGE_SIZE);
                  }}
                  aria-pressed={category === item.name}
                  className={cn(chipBase, category === item.name ? chipActive : chipIdle)}
                >
                  {item.name}
                  <span className="ml-1.5 text-xs opacity-70">{item.count}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-muted-foreground" aria-live="polite">
            {filteredProducts.length === 1
              ? "1 producto"
              : `${filteredProducts.length} productos`}
            {category !== "all" && (
              <span className="text-foreground"> en {category}</span>
            )}
          </p>
          {hasFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="h-8 rounded-full px-3 text-xs font-semibold text-muted-foreground"
            >
              Limpiar filtros
            </Button>
          )}
        </div>

        {filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed bg-muted/30 px-6 py-16 text-center">
            <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-background shadow-sm">
              <SearchX className="size-7 text-muted-foreground" aria-hidden="true" />
            </div>
            <h2 className="text-lg font-bold text-foreground">No encontramos productos</h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Probá con otra búsqueda o elegí otra categoría. También podés limpiar los filtros.
            </p>
            {hasFilters && (
              <Button
                type="button"
                onClick={clearFilters}
                className="mt-5 rounded-xl"
              >
                Limpiar filtros
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleProducts.map((product, index) => (
              <ProductCard
                key={product.id}
                product={product}
                cartQuantity={cartQuantities.get(product.id) ?? 0}
                onAddToCart={handleAddToCart}
                businessSlug={businessSlug}
                priority={index < 4}
              />
            ))}
          </div>
        )}

        {hasMore && (
          <div className="mt-8 flex flex-col items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
              className="h-11 touch-manipulation rounded-xl px-6 font-semibold"
            >
              Cargar más productos
            </Button>
            <p className="text-xs text-muted-foreground" aria-live="polite">
              Mostrando {visibleProducts.length} de {filteredProducts.length}
            </p>
          </div>
        )}

        <p className="mt-10 text-center text-xs text-muted-foreground">
          Precios en pesos argentinos. Stock sujeto a disponibilidad.
        </p>
      </main>
    </div>
  );
};

export default ProductSelector;
