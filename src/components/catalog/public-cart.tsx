"use client";

import { useContext, useState } from "react";
import { CartContext } from "./context/CartContext";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Trash2, Plus, Minus, Receipt } from "lucide-react";
import { CheckoutForm } from "./checkout-form";
import { ProductVisual } from "./ProductVisual";
import { formatCurrency } from "./catalog-format";
import { cn } from "@/lib/utils";
import type Product from "@/models/Product";

interface PublicCartProps {
  businessId: string;
}

export function PublicCart({ businessId }: PublicCartProps) {
  const { cartState, removeAll, removeItem, addUnit, removeUnit } = useContext(CartContext);
  const [isOpen, setIsOpen] = useState(false);
  const [isCheckout, setIsCheckout] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<Product | null>(null);

  const itemCount = cartState.products.reduce((acc, item) => acc + (item.amount || 0), 0);
  const cartTotal = cartState.products.reduce(
    (acc, item) => acc + (item.salePrice || item.price || 0) * (item.amount || 1),
    0,
  );

  const handleSheetChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setTimeout(() => setIsCheckout(false), 300);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={handleSheetChange}>
      <SheetTrigger asChild>
        <Button
          type="button"
          size="icon"
          className={cn(
            "fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-4 z-50 size-14 touch-manipulation rounded-full shadow-2xl shadow-black/20 motion-safe:transition-transform motion-safe:duration-200 hover:scale-[1.02] sm:right-6",
            isOpen && "hidden",
          )}
          aria-label={
            itemCount > 0
              ? `Abrir carrito, ${itemCount} productos`
              : "Abrir carrito"
          }
        >
          <ShoppingCart className="size-6" aria-hidden="true" />
          {itemCount > 0 && (
            <span className="absolute -right-1 -top-1 flex min-w-6 items-center justify-center rounded-full bg-primary-foreground px-1.5 py-0.5 text-xs font-black tabular-nums text-primary shadow-sm">
              {itemCount}
            </span>
          )}
        </Button>
      </SheetTrigger>

      <SheetContent className="flex w-full flex-col gap-0 overflow-hidden overscroll-contain p-0 sm:max-w-md">
        <SheetHeader className="shrink-0 border-b p-4 pr-12 sm:p-5">
          <SheetTitle className="flex items-center gap-2 text-xl font-black">
            {isCheckout ? (
              <>
                <Receipt className="size-5" aria-hidden="true" /> Detalle del pedido
              </>
            ) : (
              <>
                <ShoppingCart className="size-5" aria-hidden="true" /> Mi carrito
                {itemCount > 0 && (
                  <span className="ml-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-bold text-secondary-foreground">
                    {itemCount}
                  </span>
                )}
              </>
            )}
          </SheetTitle>
          <SheetDescription className="sr-only">
            Revisá los productos de tu pedido y continuá al pago.
          </SheetDescription>
        </SheetHeader>

        {isCheckout ? (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">
            <CheckoutForm
              businessId={businessId}
              onSuccess={() => setIsOpen(false)}
              onCancel={() => setIsCheckout(false)}
            />
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">
              {cartState.products.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center text-muted-foreground">
                  <div className="flex size-16 items-center justify-center rounded-2xl bg-muted">
                    <ShoppingCart className="size-8 opacity-40" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-foreground">Tu carrito está vacío</p>
                    <p className="mt-1 text-sm">Explorá el catálogo y agregá tus productos.</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => setIsOpen(false)}
                  >
                    Seguir comprando
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {cartState.products.map((item) => {
                    const unitPrice = item.salePrice || item.price || 0;
                    const lineTotal = unitPrice * (item.amount || 0);
                    return (
                      <div
                        key={item.id}
                        className="flex gap-3 rounded-2xl border bg-card p-3 shadow-sm"
                      >
                        <div className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-muted">
                          <ProductVisual
                            image={item.image}
                            images={item.images}
                            description={item.description}
                            category={item.category}
                            sizes="56px"
                            showLabel={false}
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-sm font-semibold leading-snug text-card-foreground" title={item.description || ""}>
                            {item.description || "Producto"}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {formatCurrency(unitPrice)} c/u
                          </p>

                          <div className="mt-2 flex items-center justify-between gap-2">
                            <div className="flex items-center rounded-full border bg-background p-0.5">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-7 rounded-full"
                                onClick={() => removeUnit(item)}
                                disabled={(item.amount || 0) <= 1}
                                aria-label={`Quitar una unidad de ${item.description || "producto"}`}
                              >
                                <Minus className="size-3" aria-hidden="true" />
                              </Button>
                              <span className="w-7 text-center text-xs font-bold tabular-nums">
                                {item.amount}
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-7 rounded-full"
                                onClick={() => addUnit(item)}
                                aria-label={`Agregar una unidad de ${item.description || "producto"}`}
                              >
                                <Plus className="size-3" aria-hidden="true" />
                              </Button>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold tabular-nums text-foreground">
                                {formatCurrency(lineTotal)}
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-8 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => setItemToDelete(item)}
                                aria-label={`Eliminar ${item.description || "producto"} del carrito`}
                              >
                                <Trash2 className="size-4" aria-hidden="true" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {cartState.products.length > 0 && (
              <div className="shrink-0 border-t bg-background p-4 sm:p-5">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <span className="text-sm font-medium text-muted-foreground">Total estimado</span>
                  <span className="text-2xl font-black tabular-nums text-foreground">
                    {formatCurrency(cartTotal)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="h-11 w-full rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => removeAll()}
                  >
                    Vaciar
                  </Button>
                  <Button
                    type="button"
                    size="lg"
                    className="h-11 w-full rounded-xl font-semibold"
                    onClick={() => setIsCheckout(true)}
                  >
                    Comprar
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </SheetContent>

      <AlertDialog
        open={Boolean(itemToDelete)}
        onOpenChange={(open) => {
          if (!open) setItemToDelete(null);
        }}
      >
        <AlertDialogContent className="z-[60]">
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar producto</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Querés eliminar {itemToDelete?.description || "este producto"} del carrito?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (itemToDelete) removeItem(itemToDelete);
                setItemToDelete(null);
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
