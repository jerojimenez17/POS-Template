"use client";

import { useContext, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { Input } from "../ui/input";
import { SearchX, Filter, PackageSearch } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import ProductCard from "./ProductCard";
import { SkeletonCard } from "./product-card-skeleton";
import { CartContext } from "./context/CartContext";
import { PublicProduct } from "@/actions/catalog";
import Product from "@/models/Product";

const ProductModal = dynamic(
  () => import("@/components/stock/product-modal").then((mod) => mod.ProductModal),
  { ssr: false, loading: () => <div className="h-32 w-28 bg-gray-200 animate-pulse rounded-lg" /> }
);

type ProductSelectorVariant = "public-catalog" | "internal-selector";

interface Props {
  variant: ProductSelectorVariant;
  products?: PublicProduct[];
  business?: {
    name: string;
    logo: string | null;
  };
}

const ProductSelector = ({
  variant,
  products,
  business,
}: Props) => {
  const isCatalog = variant === "public-catalog";
  const [isLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [unitsToOrder, setUnitsToOrder] = useState({ id: "", amount: 0 });
  const { addItem } = useContext(CartContext);

  const categories = useMemo(() => {
    const cats = products?.map((p) => p.category).filter(Boolean) as string[];
    return [...new Set(cats)];
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    return products.filter((product) => {
      const matchesSearch =
        search === "" ||
        product.description?.toLowerCase().includes(search.toLowerCase()) ||
        product.code?.toLowerCase().includes(search.toLowerCase()) ||
        product.brand?.toLowerCase().includes(search.toLowerCase()) ||
        product.category?.toLowerCase().includes(search.toLowerCase());
      const matchesCategory =
        category === "all" || product.category === category;
      return matchesSearch && matchesCategory;
    });
  }, [products, search, category]);

  const handleQuantityChange = (id: string, amount: number) => {
    setUnitsToOrder({ id, amount });
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
    product.image = publicProduct.image ?? "";
    product.amount = quantity;
    product.price = publicProduct.salePrice;
    product.subCategory = "";
    product.gain = 0;
    product.client_bonus = 0;
    product.imageName = "";
    product.last_update = new Date();
    product.creation_date = new Date();
    addItem(product);
    setUnitsToOrder({ amount: 0, id: "" });
  };

  return (
    <div className="flex w-full h-full flex-col bg-slate-50/50 dark:bg-gray-950/50 min-h-screen relative">
      {/* Decorative background elements */}
      <div className="absolute top-0 left-0 w-full h-64 bg-linear-to-b from-primary/5 to-transparent pointer-events-none" />
      
      {isCatalog ? (
        <div className="w-full py-8 text-center relative z-10">
          {business?.logo ? (
            <div className="bg-white/50 dark:bg-white/10 backdrop-blur-md rounded-2xl p-4 inline-block shadow-lg border border-white/20">
              <Image
                className="w-32 h-12 antialiased object-contain"
                src={business.logo || ""}
                alt={business.name ?? "Logo"}
                width={128}
                height={48}
              />
            </div>
          ) : (
            <div className="inline-block p-6 rounded-3xl bg-white dark:bg-gray-800 shadow-xl border border-gray-100 dark:border-gray-700">
              <h1 className="text-3xl font-black bg-linear-to-r from-primary to-blue-600 bg-clip-text text-transparent italic">
                {business?.name ?? "MUESTREO DE PRODUCTO"}
              </h1>
            </div>
          )}
        </div>
      ) : (
        <div className="p-6">
          <h2 className="text-2xl font-black flex items-center gap-2">
            <PackageSearch className="text-primary" />
            Selección de Productos
          </h2>
        </div>
      )}

      {/* Control Bar */}
      <div className="sticky top-0 z-50 px-4 py-4 mb-4">
        <div className="max-w-5xl mx-auto">
          <div className="p-3 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-[2.5rem] shadow-2xl shadow-black/5 border border-white/20 dark:border-gray-800 flex flex-col md:flex-row gap-3 items-center">
            <div className="relative w-full flex-1 group">
              <SearchX className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <Input
                type="text"
                placeholder="Buscar por nombre, código o marca..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-12 h-14 bg-gray-50/50 dark:bg-gray-800/50 border-none rounded-3xl focus-visible:ring-2 focus-visible:ring-primary text-base"
              />
            </div>
            
            <div className="flex gap-2 w-full md:w-auto">
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-14 w-full md:w-[220px] bg-gray-50/50 dark:bg-gray-800/50 border-none rounded-3xl focus-visible:ring-2 focus-visible:ring-primary px-6">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Filter className="h-4 w-4" />
                    <SelectValue placeholder="Categoría" />
                  </div>
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-none shadow-2xl p-2">
                  <SelectItem value="all" className="rounded-xl">Todas las categorías</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat} className="rounded-xl capitalize">
                      {cat.toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>
      <div
        className="flex flex-wrap my-4 max-h-full overflow-auto max-w-full mx-auto justify-center z-10 gap-2"
        style={{ contentVisibility: "auto" }}
      >
        {isLoading ? (
          <div className="flex gap-4">
            {[...Array(6)].map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <SearchX className="h-12 w-12 text-muted-foreground mb-4" aria-hidden="true" />
            <h3 className="text-lg font-semibold">No se encontraron productos</h3>
            <p className="text-muted-foreground">
              Intenta ajustar tu búsqueda o filtro de categoría
            </p>
          </div>
        ) : (
          filteredProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              isCatalog={isCatalog}
              unitsToOrder={unitsToOrder}
              onQuantityChange={handleQuantityChange}
              onAddToCart={handleAddToCart}
              ProductModal={ProductModal}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default ProductSelector;