"use client";

import { useEffect, useState, useCallback } from "react";
import ProductForm from "./product-form";
import StockFilterPanel from "./stock-filter-panel";
import ProductDataTable from "../ProductDataTable";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { getProducts } from "@/actions/stock";
import { ProductExtended } from "./product-form";
import ExcelUploadModal from "./excel-upload-modal";



const ProductDashboard = () => {
  const [openModal, setOpenModal] = useState(false);
  const [openExcelModal, setOpenExcelModal] = useState(false);

  const [descriptionFilter, setDescriptionFilter] = useState("");
  const [products, setProducts] = useState<ProductExtended[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getProducts();
      setProducts(data as ProductExtended[]);
    } catch (error) {
      console.error("Error fetching products:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-900 pb-20">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <Dialog open={openModal} onOpenChange={setOpenModal}>
          <DialogContent className="overflow-hidden flex flex-col max-h-[90vh] sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Agregar producto</DialogTitle>
            </DialogHeader>

            <ProductForm 
              onClose={() => {
                setOpenModal(false);
                fetchProducts();
              }} 
            />
          </DialogContent>
        </Dialog>
        
        <div className="mb-6">
          <StockFilterPanel
            handleDescriptionFilter={(filter: string) =>
              setDescriptionFilter(filter)
            }
            handleOpenModal={() => setOpenModal(!openModal)}
            handleOpenExcelModal={() => setOpenExcelModal(true)}
            handleOpenSelectionModal={() => {}}
          />
        </div>

        <ExcelUploadModal 
          open={openExcelModal} 
          onOpenChange={setOpenExcelModal} 
          onSuccess={fetchProducts} 
        />
        
        {loading ? (
          <div className="flex items-center justify-center p-10">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <ProductDataTable
            descriptionFilter={descriptionFilter}
            products={products}
            onRefresh={fetchProducts}
          />
        )}
      </div>






    </div>
  );
};

export default ProductDashboard;
