"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Plus, Search, Edit3 } from "lucide-react";
import OrderItemsTable from "./OrderItemsTable";
import { addItemsToOrder, updateOrderItem, removeOrderItem } from "@/actions/unpaid-orders";
import { getProducts } from "@/actions/stock";

interface OrderItemFromDB {
  id: string;
  productId: string | null;
  description: string | null;
  code: string | null;
  price: number;
  quantity: number;
  subTotal: number;
  addedAt: Date;
}

interface OrderItem {
  id: string;
  productId?: string;
  description: string;
  code: string | null;
  price: number;
  quantity: number;
  subTotal: number;
  addedAt: Date;
}

interface Order {
  id: string;
  total: number;
  paidStatus: string;
  clientId: string | null;
  items: OrderItemFromDB[];
}

interface Product {
  id: string;
  code: string | null;
  description: string | null;
  salePrice: number;
  amount: number;
}

interface EditableOrderDetailProps {
  order: Order;
  businessId: string;
  onOrderUpdated?: () => void;
}

export default function EditableOrderDetail({
  order,
  businessId,
  onOrderUpdated,
}: EditableOrderDetailProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [items, setItems] = useState<OrderItem[]>(
    order.items.map((item) => ({
      ...item,
      productId: item.productId ?? undefined,
      description: item.description || "Producto",
    }))
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [searchProduct, setSearchProduct] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    setItems(
      order.items.map((item) => ({
        ...item,
        productId: item.productId ?? undefined,
        description: item.description || "Producto",
      }))
    );
  }, [order.items]);

  useEffect(() => {
    if (searchProduct) {
      const filtered = products.filter(
        (p) =>
          p.description?.toLowerCase().includes(searchProduct.toLowerCase()) ||
          p.code?.toLowerCase().includes(searchProduct.toLowerCase())
      );
      setFilteredProducts(filtered);
    } else {
      setFilteredProducts(products);
    }
  }, [searchProduct, products]);

  const fetchProducts = async () => {
    try {
      const data = await getProducts();
      setProducts(data || []);
      setFilteredProducts(data || []);
    } catch (error) {
      console.error("Error fetching products:", error);
      toast.error("Error al cargar productos");
    }
  };

  const handleOpenAddProduct = async () => {
    await fetchProducts();
    setSelectedProduct(null);
    setQuantity(1);
    setSearchProduct("");
    setIsAddProductOpen(true);
  };

  const handleUpdateQuantity = async (itemId: string, newQuantity: number) => {
    setIsLoading(true);
    try {
      const result = await updateOrderItem({
        itemId,
        orderId: order.id,
        quantity: newQuantity,
      });

      if (result.success) {
        setItems((prev) =>
          prev.map((item) =>
            item.id === itemId
              ? { ...item, quantity: newQuantity, subTotal: newQuantity * item.price }
              : item
          )
        );
        toast.success("Cantidad actualizada");
        onOrderUpdated?.();
      } else {
        toast.error(result.error || "Error al actualizar cantidad");
      }
    } catch (error) {
      console.error("Error updating quantity:", error);
      toast.error("Error al actualizar cantidad");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdatePrice = async (itemId: string, newPrice: number) => {
    setIsLoading(true);
    try {
      const result = await updateOrderItem({
        itemId,
        orderId: order.id,
        price: newPrice,
      });

      if (result.success) {
        setItems((prev) =>
          prev.map((item) =>
            item.id === itemId
              ? { ...item, price: newPrice, subTotal: item.quantity * newPrice }
              : item
          )
        );
        toast.success("Precio actualizado");
        onOrderUpdated?.();
      } else {
        toast.error(result.error || "Error al actualizar precio");
      }
    } catch (error) {
      console.error("Error updating price:", error);
      toast.error("Error al actualizar precio");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    setIsLoading(true);
    try {
      const result = await removeOrderItem({
        itemId,
        orderId: order.id,
      });

      if (result.success) {
        setItems((prev) => prev.filter((item) => item.id !== itemId));
        toast.success("Item eliminado");
        onOrderUpdated?.();
      } else {
        toast.error(result.error || "Error al eliminar item");
      }
    } catch (error) {
      console.error("Error removing item:", error);
      toast.error("Error al eliminar item");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddProduct = async () => {
    if (!selectedProduct) {
      toast.error("Seleccione un producto");
      return;
    }

    if (quantity <= 0) {
      toast.error("La cantidad debe ser mayor a 0");
      return;
    }

    setIsLoading(true);
    try {
      const result = await addItemsToOrder({
        orderId: order.id,
        businessId,
        items: [
          {
            productId: selectedProduct.id,
            code: selectedProduct.code || undefined,
            description: selectedProduct.description || undefined,
            price: selectedProduct.salePrice,
            quantity: quantity,
            subTotal: selectedProduct.salePrice * quantity,
          },
        ],
      });

      if (result.success) {
        toast.success("Producto agregado");
        const newItem: OrderItem = {
          id: Date.now().toString(),
          productId: selectedProduct.id,
          description: selectedProduct.description || "Producto",
          code: selectedProduct.code,
          price: selectedProduct.salePrice,
          quantity: quantity,
          subTotal: selectedProduct.salePrice * quantity,
          addedAt: new Date(),
        };
        setItems((prev) => [...prev, newItem]);
        setIsAddProductOpen(false);
        onOrderUpdated?.();
      } else {
        toast.error(result.error || "Error al agregar producto");
      }
    } catch (error) {
      console.error("Error adding product:", error);
      toast.error("Error al agregar producto");
    } finally {
      setIsLoading(false);
    }
  };

  if (order.paidStatus === "pago") {
    return null;
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button variant="outline" onClick={() => setIsEditing(!isEditing)}>
          <Edit3 className="h-4 w-4 mr-2" />
          {isEditing ? "Cancelar edición" : "Editar items"}
        </Button>
      </div>

      <OrderItemsTable
        items={items}
        isEditable={isEditing}
        onUpdateQuantity={isEditing ? handleUpdateQuantity : undefined}
        onUpdatePrice={isEditing ? handleUpdatePrice : undefined}
        onRemoveItem={isEditing ? handleRemoveItem : undefined}
        onAddItem={isEditing ? handleOpenAddProduct : undefined}
      />

      <Dialog open={isAddProductOpen} onOpenChange={setIsAddProductOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Agregar Producto</DialogTitle>
            <DialogDescription>
              Seleccione un producto para agregar a la orden
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar producto..."
                value={searchProduct}
                onChange={(e) => setSearchProduct(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="max-h-[250px] overflow-y-auto border rounded-lg">
              {filteredProducts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No se encontraron productos
                </div>
              ) : (
                filteredProducts.map((product) => (
                  <div
                    key={product.id}
                    onClick={() => setSelectedProduct(product)}
                    className={`p-3 cursor-pointer border-b last:border-b-0 transition-colors ${
                      selectedProduct?.id === product.id
                        ? "bg-primary/10"
                        : "hover:bg-muted"
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-medium">
                          {product.description || "Producto"}
                        </div>
                        {product.code && (
                          <div className="text-xs text-muted-foreground">
                            {product.code}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="font-medium">
                          ${product.salePrice.toLocaleString("es-AR")}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Stock: {product.amount}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {selectedProduct && (
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                  <label className="text-sm font-medium">Cantidad</label>
                  <Input
                    type="number"
                    min={1}
                    max={selectedProduct.amount}
                    value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                  />
                </div>
                <div className="flex-1 text-right">
                  <p className="text-sm text-muted-foreground">Subtotal</p>
                  <p className="text-lg font-bold">
                    $
                    {(
                      selectedProduct.salePrice * quantity
                    ).toLocaleString("es-AR")}
                  </p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={isLoading}>
                Cancelar
              </Button>
            </DialogClose>
            <Button
              onClick={handleAddProduct}
              disabled={isLoading || !selectedProduct}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
