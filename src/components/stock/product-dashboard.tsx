"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import ProductForm from "./product-form";
import StockFilterPanel from "./stock-filter-panel";
import ProductDataTable from "../ProductDataTable";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { getProductsPaginated } from "@/actions/stock";
import { ProductExtended } from "./product-form";
import ExcelUploadModal from "./excel-upload-modal";

const PAGE_SIZE = 25;

const ProductDashboard = () => {
  const [openModal, setOpenModal] = useState(false);
  const [openExcelModal, setOpenExcelModal] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
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

  const fetchProducts = useCallback(async (pageNum: number, searchTerm: string) => {
    setLoading(true);
    try {
      const result = await getProductsPaginated({
        page: pageNum,
        pageSize: PAGE_SIZE,
        search: searchTerm || undefined,
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
    fetchProducts(1, "");
  }, [fetchProducts]);

  useEffect(() => {
    fetchProducts(page, debouncedSearch);
  }, [debouncedSearch]);

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
    fetchProducts(newPage, debouncedSearch);
  }, [debouncedSearch, fetchProducts]);

  const handleRefresh = useCallback(() => {
    fetchProducts(page, debouncedSearch);
  }, [page, debouncedSearch, fetchProducts]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-900 pb-20">
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
