"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Package } from "lucide-react";
import ProductForm from "./product-form";
import StockFilterPanel from "./stock-filter-panel";
import ProductDataTable from "../ProductDataTable";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { getProductsPaginated } from "@/actions/stock";
import { ProductExtended } from "./product-form";
import ExcelUploadModal from "./excel-upload-modal";

const PAGE_SIZE = 25;

const ProductDashboard = () => {
  const router = useRouter();
  const [openModal, setOpenModal] = useState(false);
  const [openExcelModal, setOpenExcelModal] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [codeOnly, setCodeOnly] = useState(false);
  const [exactCode, setExactCode] = useState(false);
  const [products, setProducts] = useState<ProductExtended[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 300);
  }, []);

  const fetchProducts = useCallback(async (pageNum: number, searchTerm: string, codeOnlySearch?: boolean, exactCodeSearch?: boolean) => {
    setLoading(true);
    try {
      const result = await getProductsPaginated({
        page: pageNum,
        pageSize: PAGE_SIZE,
        search: searchTerm || undefined,
        codeOnly: codeOnlySearch,
        exactCode: exactCodeSearch,
      });
      setProducts(result.products as ProductExtended[]);
      setTotal(result.total);
      setTotalPages(result.totalPages);
      setPage(result.page);
    } catch (error) {
      console.error("Error fetching products:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProducts(1, "");
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchProducts]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProducts(page, debouncedSearch, codeOnly, exactCode);
    }, 0);
    return () => clearTimeout(timer);
  }, [page, debouncedSearch, codeOnly, exactCode, fetchProducts]);

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
    fetchProducts(newPage, debouncedSearch, codeOnly, exactCode);
  }, [debouncedSearch, codeOnly, exactCode, fetchProducts]);

  const handleRefresh = useCallback(() => {
    fetchProducts(page, debouncedSearch, codeOnly, exactCode);
  }, [page, debouncedSearch, codeOnly, exactCode, fetchProducts]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-900 pb-20">
      <header className="p-4 md:p-6 border-b bg-white dark:bg-gray-900 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push("/")} title="Volver">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <Package className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight">Stock</h1>
              <p className="text-sm text-gray-500 hidden sm:block">Gestioná productos y stock</p>
            </div>
          </div>
        </div>
      </header>
      <div className="max-w-7xl mx-auto px-4 py-6">
        <Dialog open={openModal} onOpenChange={setOpenModal}>
          <DialogContent className="overflow-y-auto max-h-[90vh] sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>Agregar producto</DialogTitle>
            </DialogHeader>

            <ProductForm 
              onClose={() => {
                setOpenModal(false);
                handleRefresh();
              }} 
            />
          </DialogContent>
        </Dialog>
        
        <div className="mb-6">
          <StockFilterPanel
            onSearchChange={handleSearchChange}
            handleOpenModal={() => setOpenModal(!openModal)}
            handleOpenExcelModal={() => setOpenExcelModal(true)}
            handleOpenSelectionModal={() => {}}
            codeOnly={codeOnly}
            onCodeOnlyChange={setCodeOnly}
            exactCode={exactCode}
            onExactCodeChange={setExactCode}
          />
        </div>

        <ExcelUploadModal 
          open={openExcelModal} 
          onOpenChange={setOpenExcelModal} 
          onSuccess={handleRefresh} 
        />
        
        <ProductDataTable
          products={products}
          total={total}
          page={page}
          totalPages={totalPages}
          loading={loading}
          onPageChange={handlePageChange}
          onRefresh={handleRefresh}
          hasActiveFilter={search !== ""}
        />
      </div> 
    </div>
  );
};

export default ProductDashboard;
