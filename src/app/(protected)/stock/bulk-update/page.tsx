"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CheckSquare, Square, Printer, Percent, ArrowLeft, Filter, X } from "lucide-react";
import { getProductsFiltered, bulkUpdatePrices } from "@/actions/stock";
import { getCategories } from "@/actions/categories";
import { getBrands } from "@/actions/brands";
import { ProductExtended } from "@/components/stock/product-form";
import ProductPrintModal from "@/components/stock/product-print-modal";
import BulkUnitUpdate from "@/components/stock/bulk-unit-update";

interface FilterState {
  search: string;
  categoryId: string;
  brandId: string;
  unit: string;
}

const BulkUpdatePage = () => {
  const router = useRouter();
  const [filteredProducts, setFilteredProducts] = useState<ProductExtended[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const [filters, setFilters] = useState<FilterState>({
    search: "",
    categoryId: "",
    brandId: "",
    unit: "",
  });
  const [loading, setLoading] = useState(false);
  const [percentage, setPercentage] = useState<string>("");
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getProductsFiltered({
        search: filters.search || undefined,
        categoryId: filters.categoryId || undefined,
        brandId: filters.brandId || undefined,
        unit: filters.unit || undefined,
      });
      setFilteredProducts(data as ProductExtended[]);
      setSelectedIds(new Set(data.map((p: ProductExtended) => p.id)));
    } catch (error) {
      console.error("Error fetching products:", error);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadFiltersData();
    fetchProducts();
  }, [fetchProducts]);

  const loadFiltersData = async () => {
    try {
      const [cats, brnds] = await Promise.all([
        getCategories(),
        getBrands(),
      ]);
      setCategories(cats as { id: string; name: string }[]);
      setBrands(brnds as { id: string; name: string }[]);
    } catch (error) {
      console.error("Error loading filter data:", error);
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredProducts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProducts.map((p) => p.id)));
    }
  };

  const handleToggleProduct = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleBulkPriceUpdate = async () => {
    const percent = parseFloat(percentage);
    if (isNaN(percent) || percent < 0 || percent > 100) {
      alert("Porcentaje inválido");
      return;
    }

    if (selectedIds.size === 0) {
      alert("No hay productos seleccionados");
      return;
    }

    if (!confirm(`¿Aplicar ${percent}% de aumento a ${selectedIds.size} productos?`)) {
      return;
    }

    const result = await bulkUpdatePrices(Array.from(selectedIds), percent);
    
    if (result.success) {
      alert("Precios actualizados correctamente");
      fetchProducts();
      setIsFiltersOpen(false);
    } else {
      alert(result.error || "Error al actualizar precios");
    }
  };

  const handlePrint = () => {
    setShowPrintModal(true);
  };

  const selectedProducts = filteredProducts.filter((p) => selectedIds.has(p.id));

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-50 dark:bg-gray-950">
      {/* Header */}
      <header className="p-4 md:p-6 border-b bg-white dark:bg-gray-900 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} title="Volver">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight">Actualización en Lote</h1>
            <p className="text-sm text-gray-500 hidden sm:block">Filtra y selecciona productos para actualizaciones masivas</p>
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-3">
          <Button
            variant="outline"
            className="md:hidden"
            onClick={() => setIsFiltersOpen(!isFiltersOpen)}
            aria-label="Alternar filtros"
          >
            <Filter className="h-4 w-4" />
          </Button>
          <Button 
            onClick={handlePrint} 
            disabled={selectedProducts.length === 0}
            className="bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 px-3 md:px-4"
            aria-label={`Imprimir ${selectedProducts.length} productos seleccionados`}
          >
            <Printer className="h-4 w-4 md:mr-2" />
            <span className="hidden sm:inline">Imprimir</span>
            <span className="ml-1 md:ml-0">({selectedProducts.length})</span>
          </Button>
        </div>
      </header>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {/* Sidebar: Filters & Bulk Actions */}
        <aside className={`${isFiltersOpen ? "flex" : "hidden"} md:flex absolute md:relative z-20 inset-0 md:inset-auto w-full md:w-120 border-r bg-white dark:bg-gray-900 flex-col shrink-0 overflow-y-auto`}>
          <div className="p-4 md:p-6 space-y-8">
            {/* Mobile Header for Filters */}
            <div className="flex items-center justify-between md:hidden mb-2">
              <h2 className="text-lg font-bold">Filtros y Acciones</h2>
              <Button variant="ghost" size="icon" onClick={() => setIsFiltersOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Filters Group */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Filtros</h3>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label htmlFor="product-search" className="text-sm font-medium">Búsqueda</label>
                  <input
                    id="product-search"
                    type="text"
                    placeholder="Código o descripción…"
                    value={filters.search}
                    onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-800 focus-visible:ring-2 focus-visible:ring-blue-500 outline-none transition-all"
                    spellCheck={false}
                    autoComplete="off"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="category-filter" className="text-sm font-medium">Categoría</label>
                  <select
                    id="category-filter"
                    value={filters.categoryId}
                    onChange={(e) => setFilters({ ...filters, categoryId: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-800 focus-visible:ring-2 focus-visible:ring-blue-500 outline-none transition-all"
                  >
                    <option value="">Todas las categorías</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="brand-filter" className="text-sm font-medium">Marca</label>
                  <select
                    id="brand-filter"
                    value={filters.brandId}
                    onChange={(e) => setFilters({ ...filters, brandId: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-800 focus-visible:ring-2 focus-visible:ring-blue-500 outline-none transition-all"
                  >
                    <option value="">Todas las marcas</option>
                    {brands.map((brand) => (
                      <option key={brand.id} value={brand.id}>{brand.name}</option>
                    ))}
                  </select>
                </div>

                <Button onClick={() => { fetchProducts(); setIsFiltersOpen(false); }} variant="default" className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-sm">
                  Aplicar Filtros
                </Button>
              </div>
            </section>

            {/* Bulk Actions Group */}
            <section className="space-y-4 pt-6 border-t">
              <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Acciones en Lote</h3>
              <div className="space-y-4">
                {/* Bulk Price Update */}
                <div className="space-y-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-800">
                  <div className="flex items-center gap-2 font-medium text-sm">
                    <Percent className="h-4 w-4 text-blue-500" />
                    Aumento de Precio
                  </div>
                  <div className="flex gap-2">
                    <input
                      id="bulk-percentage"
                      type="number"
                      placeholder="% aumento…"
                      value={percentage}
                      onChange={(e) => setPercentage(e.target.value)}
                      className="flex-1 min-w-0 px-3 py-2 border rounded-md bg-white dark:bg-gray-800 focus-visible:ring-2 focus-visible:ring-blue-500 outline-none transition-all"
                      min="0"
                      max="100"
                    />
                    <Button 
                      onClick={handleBulkPriceUpdate} 
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      disabled={selectedIds.size === 0}
                    >
                      Aplicar
                    </Button>
                  </div>
                </div>

                {/* Bulk Unit Update */}
                <div className="p-1">
                  <BulkUnitUpdate
                    selectedCount={selectedIds.size}
                    selectedIds={Array.from(selectedIds)}
                    onRefresh={() => {
                      fetchProducts();
                      setIsFiltersOpen(false);
                    }}
                    disabled={loading}
                  />
                </div>
              </div>
            </section>
          </div>
        </aside>

        {/* Main Content: Product List */}
        <main className="flex-1 flex flex-col min-w-0 bg-white dark:bg-gray-900">
          {/* Toolbar */}
          <div className="p-4 border-b flex items-center justify-between gap-4 bg-gray-50/50 dark:bg-gray-800/50">
            <div className="flex items-center gap-4">
              <Button 
                onClick={handleSelectAll} 
                variant="ghost" 
                size="sm"
                className="hover:bg-white dark:hover:bg-gray-800 shadow-sm border border-transparent hover:border-gray-200 dark:hover:border-gray-700 transition-all"
                aria-label={selectedIds.size === filteredProducts.length ? "Deseleccionar todos los productos" : "Seleccionar todos los productos"}
              >
                {selectedIds.size === filteredProducts.length ? (
                  <CheckSquare className="h-4 w-4 text-blue-500" />
                ) : (
                  <Square className="h-4 w-4 text-gray-400" />
                )}
                <span className="ml-2 font-medium">
                  {selectedIds.size === filteredProducts.length ? "Deseleccionar todos" : "Seleccionar todos"}
                </span>
              </Button>
              <div className="h-4 w-px bg-gray-300 dark:bg-gray-700 hidden sm:block" />
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                {selectedIds.size.toLocaleString("es-AR")} de {filteredProducts.length.toLocaleString("es-AR")} seleccionados
              </span>
            </div>
          </div>

          {/* List Container */}
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-500">
                <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
                <p className="font-medium">Cargando productos…</p>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-500">
                <div className="p-6 bg-gray-50 dark:bg-gray-800 rounded-full">
                  <Square className="h-12 w-12 opacity-20" />
                </div>
                <div className="text-center">
                  <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">No se encontraron productos</p>
                  <p className="text-sm">Intenta ajustar los filtros de búsqueda.</p>
                </div>
              </div>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="hidden md:block relative overflow-x-auto">
                  <table className="w-full text-sm border-separate border-spacing-0">
                    <thead className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm sticky top-0 z-10">
                      <tr>
                        <th className="p-4 w-12 border-b font-semibold text-left"></th>
                        <th className="p-4 border-b font-semibold text-left text-gray-600 dark:text-gray-400">Código</th>
                        <th className="p-4 border-b font-semibold text-left text-gray-600 dark:text-gray-400">Descripción</th>
                        <th className="p-4 border-b font-semibold text-left text-gray-600 dark:text-gray-400">Categoría</th>
                        <th className="p-4 border-b font-semibold text-left text-gray-600 dark:text-gray-400">Marca</th>
                        <th className="p-4 border-b font-semibold text-right text-gray-600 dark:text-gray-400">Precio</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {filteredProducts.map((product) => (
                        <tr
                          key={product.id}
                          className={`group hover:bg-blue-50/50 dark:hover:bg-blue-900/10 cursor-pointer transition-colors ${
                            selectedIds.has(product.id) ? "bg-blue-50/30 dark:bg-blue-900/5" : ""
                          }`}
                          onClick={() => handleToggleProduct(product.id)}
                        >
                          <td className="p-4 text-center">
                            {selectedIds.has(product.id) ? (
                              <CheckSquare className="h-5 w-5 text-blue-500" />
                            ) : (
                              <Square className="h-5 w-5 text-gray-300 group-hover:text-gray-400 transition-colors" />
                            )}
                          </td>
                          <td className="p-4 font-mono text-xs text-gray-500 dark:text-gray-400">{product.code}</td>
                          <td className="p-4 font-medium text-gray-900 dark:text-gray-100">{product.description}</td>
                          <td className="p-4 text-gray-600 dark:text-gray-400">
                            <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-xs">{product.category?.name}</span>
                          </td>
                          <td className="p-4 text-gray-600 dark:text-gray-400">
                            {product.brand?.name}
                          </td>
                          <td className="p-4 text-right font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                            {Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(product.salePrice)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden divide-y divide-gray-100 dark:divide-gray-800">
                  {filteredProducts.map((product) => (
                    <div
                      key={product.id}
                      className={`p-4 active:bg-blue-50 dark:active:bg-blue-900/10 flex items-start gap-3 ${
                        selectedIds.has(product.id) ? "bg-blue-50/30 dark:bg-blue-900/5" : ""
                      }`}
                      onClick={() => handleToggleProduct(product.id)}
                    >
                      <div className="shrink-0 pt-0.5">
                        {selectedIds.has(product.id) ? (
                          <CheckSquare className="h-6 w-6 text-blue-500" />
                        ) : (
                          <Square className="h-6 w-6 text-gray-300" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start gap-2">
                          <p className="font-bold text-gray-900 dark:text-gray-100 truncate">{product.description}</p>
                          <p className="font-bold text-blue-600 dark:text-blue-400 shrink-0">
                            {Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(product.salePrice)}
                          </p>
                        </div>
                        <p className="text-xs font-mono text-gray-500 dark:text-gray-400 mt-0.5">{product.code}</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[10px] text-gray-600 dark:text-gray-400">
                            {product.category?.name}
                          </span>
                          {product.brand?.name && (
                            <span className="px-1.5 py-0.5 bg-gray-50 dark:bg-gray-900 rounded text-[10px] text-gray-500">
                              {product.brand.name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </main>
      </div>

      {showPrintModal && (
        <ProductPrintModal
          open={showPrintModal}
          onOpenChange={setShowPrintModal}
          products={selectedProducts}
        />
      )}
    </div>
  );
};

export default BulkUpdatePage;
