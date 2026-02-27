"use client";

import { useEffect, useState, useCallback } from "react";
import ProductForm from "./product-form";
import StockFilterPanel from "./stock-filter-panel";
import { Session } from "next-auth";
import ProductDataTable from "../ProductDataTable";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { getProducts } from "@/actions/stock";
import { ProductExtended } from "./product-form";

interface props {
}

const ProductDashboard = ({ }: props) => {
  const [openModal, setOpenModal] = useState(false);
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
    <div className="flex flex-col h-full w-full items-center">
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
      <StockFilterPanel
        handleDescriptionFilter={(filter: string) =>
          setDescriptionFilter(filter)
        }
        handleOpenModal={() => setOpenModal(!openModal)}
      />
      
      {loading ? (
        <div className="flex items-center justify-center p-10">
          <p className="text-lg font-semibold animate-pulse">Cargando productos...</p>
        </div>
      ) : (
        <ProductDataTable
          descriptionFilter={descriptionFilter}
          products={products}
          onRefresh={fetchProducts}
        />
      )}
    </div>
  );
};

export default ProductDashboard;
