"use client";

import { useEffect, useContext, useState, useRef, useMemo } from "react";
import BillParametersForm from "@/components/Billing/BillParametersForm";
import ProductsTable from "@/components/Billing/ProductsTable";
import { BillContext } from "@/context/BillContext";
import BillState from "@/models/BillState";
import { Session } from "next-auth";
import Spinner from "@/components/ui/Spinner";
import { Calculator } from "lucide-react";

interface EditSaleWrapperProps {
  sale: BillState;
  session: Session | null;
}

const EditSaleWrapper = ({ sale, session }: EditSaleWrapperProps) => {
  const { dispatch, BillState: ctx } = useContext(BillContext);
  const [isInitializing, setIsInitializing] = useState(true);
  const initialized = useRef(false);

  useEffect(() => {
    if (sale && !initialized.current) {
      dispatch({ type: "setState", payload: sale });
      initialized.current = true;
      // Allow a brief moment for the context to update before rendering
      setTimeout(() => setIsInitializing(false), 50);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sale]);

  // Derived totals from BillContext
  const subtotal = useMemo(
    () =>
      ctx.products.reduce(
        (sum, p: BillState["products"][0]) =>
          sum + (p.salePrice || p.price || 0) * p.amount,
        0,
      ),
    [ctx.products],
  );
  const discountPct = ctx.discount || 0;
  const discountAmount = subtotal * discountPct / 100;
  const totalFinal = subtotal - discountAmount;

  const formato = (n: number) =>
    n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (isInitializing) {
    return (
      <div className="flex justify-center items-center h-[50vh]">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full mb-5 pb-16 overflow-y-auto overflow-x-hidden scrollbar-gutter-stable">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Editar Venta</h1>
      </div>

      {/* ──── PARAMETER CARDS ──── */}
      <div className="mb-6">
        <BillParametersForm layout="cards" />
      </div>

      {/* ──── RESUMEN ──── */}
      <section className="bg-card border rounded-xl p-5 shadow-sm mb-6">
        <h3 className="text-sm font-semibold text-card-foreground mb-4 flex items-center gap-2">
          <Calculator className="h-4 w-4 text-muted-foreground" />
          Resumen
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-4 items-center">
          <div>
            <span className="text-xs text-muted-foreground block mb-1">Subtotal</span>
            <span className="text-lg font-semibold font-mono tabular-nums">
              $ {formato(subtotal)}
            </span>
          </div>
          <div>
            <span className="text-xs text-muted-foreground block mb-1">Descuento</span>
            <div className="flex items-center gap-2">
              {discountPct > 0 ? (
                <span className="text-sm text-orange-600 dark:text-orange-400 font-medium">
                  -{discountPct}% ($ {formato(discountAmount)})
                </span>
              ) : (
                <span className="text-xs text-muted-foreground/60 italic">Sin descuento</span>
              )}
            </div>
          </div>
          <div className="sm:text-right">
            <span className="text-xs text-muted-foreground block mb-1">Total final</span>
            <span className="text-2xl font-bold font-mono tabular-nums text-primary">
              $ {formato(totalFinal)}
            </span>
          </div>
        </div>
      </section>

      <ProductsTable session={session} isEditing={true} orderId={sale.id} />
    </div>
  );
};

export default EditSaleWrapper;
