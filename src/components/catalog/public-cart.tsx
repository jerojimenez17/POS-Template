"use client";

import { useContext, useState } from "react";
import { CartContext } from "./context/CartContext";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Trash2, Plus, Minus, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CheckoutForm } from "./checkout-form";

interface PublicCartProps {
  businessId: string;
}

export function PublicCart({ businessId }: PublicCartProps) {
  const { cartState, removeAll, removeItem, addUnit, removeUnit } = useContext(CartContext);
  const [isOpen, setIsOpen] = useState(false);
  const [isCheckout, setIsCheckout] = useState(false);

  const itemCount = cartState.products.reduce((acc, item) => acc + (item.amount || 0), 0);
  const cartTotal = cartState.products.reduce(
    (acc, item) => acc + (item.salePrice || item.price || 0) * (item.amount || 1),
    0
  );

  const handleSheetChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      // Reset view to cart when closing
      setTimeout(() => setIsCheckout(false), 300);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={handleSheetChange}>
      <SheetTrigger asChild>
        <Button
          variant="default"
          size="icon"
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-2xl z-50 transition-transform hover:scale-105"
        >
          <ShoppingCart className="h-6 w-6" />
          {itemCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-2 -right-2 px-2 py-1 rounded-full flex items-center justify-center min-w-6"
            >
              {itemCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md flex flex-col p-4 sm:p-6 overflow-hidden">
        <SheetHeader className="mb-4 shrink-0">
          <SheetTitle className="flex items-center gap-2 text-2xl font-bold">
            {isCheckout ? (
              <>
                <Receipt className="h-6 w-6" /> Detalle del Pedido
              </>
            ) : (
              <>
                <ShoppingCart className="h-6 w-6" /> Mi Carrito
              </>
            )}
          </SheetTitle>
        </SheetHeader>

        {isCheckout ? (
          <div className="flex-1 overflow-y-auto pr-2">
            <CheckoutForm
              businessId={businessId}
              onSuccess={() => setIsOpen(false)}
              onCancel={() => setIsCheckout(false)}
            />
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-4">
              {cartState.products.length === 0 ? (
                <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground gap-4">
                  <ShoppingCart className="h-16 w-16 opacity-20" />
                  <p className="text-lg">Tu carrito está vacío</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {cartState.products.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-gray-900 rounded-2xl border"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate" title={item.description || ""}>
                          {item.description}
                        </p>
                        <p className="text-primary font-bold text-sm">
                          ${(item.salePrice || item.price || 0).toLocaleString("es-AR")}
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-2 bg-white dark:bg-gray-800 rounded-full border p-1 border-gray-200 dark:border-gray-700">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-full"
                          onClick={() => removeUnit(item)}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="text-xs font-semibold w-4 text-center">
                          {item.amount}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-full"
                          onClick={() => addUnit(item)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:bg-destructive/10 shrink-0"
                        onClick={() => removeItem(item)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {cartState.products.length > 0 && (
              <div className="pt-4 border-t shrink-0">
                <div className="flex justify-between items-center mb-4">
                  <span className="font-medium text-muted-foreground">Total Estimado</span>
                  <span className="text-2xl font-black">${cartTotal.toLocaleString("es-AR")}</span>
                </div>
                
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 text-destructive hover:bg-destructive/10"
                    onClick={() => removeAll()}
                  >
                    Vaciar
                  </Button>
                  <Button
                    className="flex-2 font-semibold"
                    size="lg"
                    onClick={() => setIsCheckout(true)}
                  >
                    Continuar al Pago
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
