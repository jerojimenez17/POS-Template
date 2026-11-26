"use client";

import { useEffect, useState } from "react";
import { getSaleHistoryAction, type OrderUpdateWithUser } from "@/actions/sales/get-sale-history";
import { format } from "date-fns";
import { History, User as UserIcon, Calendar, Package, Plus, Minus, UserPlus, Info, Receipt, FileText, Percent } from "lucide-react";
import Spinner from "@/components/ui/Spinner";
import { OrderUpdateChanges } from "@/models/OrderUpdateChanges";

interface Props {
  saleId: string;
}

const SaleHistory = ({ saleId }: Props) => {
  const [history, setHistory] = useState<OrderUpdateWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const fetchHistory = async () => {
      if (active) {
        setLoading(true);
        setError(null);
      }

      try {
        const data = await getSaleHistoryAction(saleId);
        if (active) setHistory(data);
      } catch (caught: unknown) {
        if (active) {
          setError(caught instanceof Error ? caught.message : "Error al cargar el historial de la venta");
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchHistory();

    return () => {
      active = false;
    };
  }, [saleId]);

  const renderChanges = (update: OrderUpdateWithUser) => {
    const changes = update.changes as unknown as OrderUpdateChanges;
    if (!changes) return null;

    switch (changes.type) {
      case "ITEMS_UPDATED": {
        // Check if products actually changed
        const changedItems = changes.items.filter(
          (item) =>
            (item.quantity && item.quantity.from !== item.quantity.to) ||
            (item.price && item.price.from !== item.price.to),
        );
        const removedItems = changes.removedItems ?? [];
        const billType = changes.billTypeChanged;
        const hasBillTypeChanges = Boolean(billType && billType.from !== billType.to);
        const iva = changes.ivaChanged;
        const normalizeIvaCondition = (value: string | null) => {
          const trimmed = (value ?? "").trim();
          return trimmed === "" ? "Consumidor Final" : trimmed;
        };
        const normalizeDocumentNumber = (value: string | null) => {
          const trimmed = (value ?? "").trim();
          return trimmed === "" || trimmed === "0" ? null : trimmed;
        };
        const hasIvaChanges = Boolean(
          iva && (
            normalizeIvaCondition(iva.from.condition) !== normalizeIvaCondition(iva.to.condition) ||
            normalizeDocumentNumber(iva.from.documentNumber) !== normalizeDocumentNumber(iva.to.documentNumber)
          ),
        );
        const payment = changes.paymentChanged;
        const hasPaymentChanges = Boolean(
          payment && (
            payment.from.method !== payment.to.method ||
            payment.from.twoMethods !== payment.to.twoMethods ||
            payment.from.secondMethod !== payment.to.secondMethod ||
            (payment.to.twoMethods && (payment.from.secondAmount ?? 0) !== (payment.to.secondAmount ?? 0))
          ),
        );
        const discount = changes.discountChanged;
        const hasDiscountChanges = Boolean(discount && discount.from !== discount.to);
        const hasVisibleChanges = changedItems.length > 0
          || removedItems.length > 0
          || hasBillTypeChanges
          || hasIvaChanges
          || hasPaymentChanges
          || hasDiscountChanges;

        return (
          <div className="space-y-3">
            {/* Product changes as single card */}
            {changedItems.length > 0 && (
              <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800">
                <Package className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0 text-sm">
                  <span className="font-medium text-blue-700 dark:text-blue-300">Productos Actualizados</span>
                  <div className="mt-2 space-y-2">
                    {changedItems.map((item, i) => (
                      <div key={i} className="flex flex-col gap-1 pt-2 border-t border-blue-100 dark:border-blue-800 first:border-0 first:pt-0">
                        <div className="font-medium text-slate-900 dark:text-white truncate">
                          {item.description || "Producto sin descripción"}
                          <span className="text-[10px] text-slate-400 font-mono ml-2">
                            CODE: {item.code || item.productId}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          {item.quantity && item.quantity.from !== item.quantity.to && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold px-1 py-0.5 bg-slate-100 dark:bg-slate-700 rounded uppercase text-slate-500">Cant:</span>
                              <span className="text-red-500 line-through text-xs font-semibold">{item.quantity.from}</span>
                              <span className="text-slate-400 text-xs">→</span>
                              <span className="text-green-600 font-bold text-xs">{item.quantity.to}</span>
                            </div>
                          )}
                          {item.price && item.price.from !== item.price.to && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold px-1 py-0.5 bg-slate-100 dark:bg-slate-700 rounded uppercase text-slate-500">Precio:</span>
                              <span className="text-red-500 line-through text-xs font-semibold">${item.price.from.toLocaleString("es-AR")}</span>
                              <span className="text-slate-400 text-xs">→</span>
                              <span className="text-green-600 font-bold text-xs">${item.price.to.toLocaleString("es-AR")}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Removed products */}
            {removedItems.length > 0 && (
              <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-100 dark:border-red-800">
                <Minus className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0 text-sm">
                  <span className="font-medium text-red-700 dark:text-red-300">Productos Eliminados</span>
                  <div className="mt-2 space-y-2">
                    {removedItems.map((item, i) => (
                      <div key={i} className="flex flex-col gap-1 pt-2 border-t border-red-100 dark:border-red-800 first:border-0 first:pt-0">
                        <div className="font-medium text-slate-900 dark:text-white truncate">
                          {item.description || "Producto sin descripción"}
                          <span className="text-[10px] text-slate-400 font-mono ml-2">
                            CODE: {item.code || item.productId || "—"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold px-1 py-0.5 bg-slate-100 dark:bg-slate-700 rounded uppercase text-slate-500">Eliminado:</span>
                          <span className="text-red-500 font-bold text-xs">x{item.quantity}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Bill type changes */}
            {billType && hasBillTypeChanges && (
              <div className="flex items-start gap-3 p-3 bg-violet-50 dark:bg-violet-900/20 rounded-lg border border-violet-100 dark:border-violet-800">
                <FileText className="h-5 w-5 text-violet-500 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <span className="font-medium text-violet-700 dark:text-violet-300">Tipo comprobante actualizado</span>
                  <div className="text-slate-600 dark:text-slate-400 mt-1">
                    <span className="font-medium text-slate-700 dark:text-slate-300">{billType.from || "—"}</span>
                    <span className="mx-1.5 text-slate-400">→</span>
                    <span className="font-bold text-violet-700 dark:text-violet-300">{billType.to}</span>
                  </div>
                </div>
              </div>
            )}

            {/* IVA changes */}
            {iva && hasIvaChanges && (
              <div className="flex items-start gap-3 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-100 dark:border-purple-800">
                <FileText className="h-5 w-5 text-purple-500 shrink-0 mt-0.5" />
                <div className="text-sm space-y-1">
                  <span className="font-medium text-purple-700 dark:text-purple-300">Condición IVA actualizada</span>
                  <div className="text-slate-600 dark:text-slate-400">
                    {normalizeIvaCondition(iva.from.condition) !== normalizeIvaCondition(iva.to.condition) && (
                      <span className="block">
                        Condición: <span className="font-medium text-slate-700 dark:text-slate-300">{iva.from.condition || "Consumidor Final"}</span>
                        <span className="mx-1.5 text-slate-400">→</span>
                        <span className="font-bold text-purple-700 dark:text-purple-300">{iva.to.condition || "Consumidor Final"}</span>
                      </span>
                    )}
                    {normalizeDocumentNumber(iva.from.documentNumber) !== normalizeDocumentNumber(iva.to.documentNumber) && (
                      <span className="block">
                        Documento: <span className="font-medium text-slate-700 dark:text-slate-300">{iva.from.documentNumber || "—"}</span>
                        <span className="mx-1.5 text-slate-400">→</span>
                        <span className="font-bold text-purple-700 dark:text-purple-300">{iva.to.documentNumber || "—"}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Payment changes */}
            {payment && hasPaymentChanges && (
              <div className="flex items-start gap-3 p-3 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg border border-cyan-100 dark:border-cyan-800">
                <Receipt className="h-5 w-5 text-cyan-500 shrink-0 mt-0.5" />
                <div className="text-sm space-y-1">
                  <span className="font-medium text-cyan-700 dark:text-cyan-300">Pago actualizado</span>
                  <div className="text-slate-600 dark:text-slate-400">
                    {payment.from.method !== payment.to.method && (
                      <span className="block">
                        Método: <span className="font-medium text-slate-700 dark:text-slate-300">{payment.from.method || "—"}</span>
                        <span className="mx-1.5 text-slate-400">→</span>
                        <span className="font-bold text-cyan-700 dark:text-cyan-300">{payment.to.method || "—"}</span>
                      </span>
                    )}
                    {payment.from.twoMethods !== payment.to.twoMethods && (
                      <span className="block text-xs">
                        Pago dividido: {payment.from.twoMethods ? "Sí" : "No"} → {payment.to.twoMethods ? "Sí" : "No"}
                      </span>
                    )}
                    {payment.from.secondMethod !== payment.to.secondMethod && (
                      <span className="block">
                        Segundo método: <span className="font-medium text-slate-700 dark:text-slate-300">{payment.from.secondMethod || "—"}</span>
                        <span className="mx-1.5 text-slate-400">→</span>
                        <span className="font-bold text-cyan-700 dark:text-cyan-300">{payment.to.secondMethod || "—"}</span>
                      </span>
                    )}
                    {payment.to.twoMethods
                      && ((payment.from.firstAmount ?? 0) !== (payment.to.firstAmount ?? 0)
                        || (payment.from.secondAmount ?? 0) !== (payment.to.secondAmount ?? 0)) && (
                      <span className="block text-xs">
                        Montos: <span className="font-medium text-slate-700 dark:text-slate-300">
                          ${(payment.from.firstAmount ?? 0).toLocaleString("es-AR")} + ${(payment.from.secondAmount ?? 0).toLocaleString("es-AR")}
                        </span>
                        <span className="mx-1.5 text-slate-400">→</span>
                        <span className="font-bold text-cyan-700 dark:text-cyan-300">
                          ${(payment.to.firstAmount ?? 0).toLocaleString("es-AR")} + ${(payment.to.secondAmount ?? 0).toLocaleString("es-AR")}
                        </span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Discount changes */}
            {discount && hasDiscountChanges && (
              <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-100 dark:border-amber-800">
                <Percent className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <span className="font-medium text-amber-700 dark:text-amber-300">Descuento actualizado</span>
                  <div className="text-slate-600 dark:text-slate-400 mt-1">
                    <span className="font-medium text-slate-700 dark:text-slate-300">{discount.from}%</span>
                    <span className="mx-1.5 text-slate-400">→</span>
                    <span className="font-bold text-amber-700 dark:text-amber-300">{discount.to}%</span>
                  </div>
                </div>
              </div>
            )}

            {/* Fallback */}
            {!hasVisibleChanges && (
              <div className="text-sm text-slate-400 italic text-center py-2">Sin cambios detectados</div>
            )}
          </div>
        );
      }

      case "ITEMS_ADDED":
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400 font-medium">
              <Plus className="h-4 w-4" />
              <span>Productos Agregados</span>
            </div>
            <ul className="space-y-2">
              {changes.items.map((item, i) => (
                <li key={i} className="flex items-center justify-between p-2 bg-green-50 dark:bg-green-900/20 rounded-md border border-green-100 dark:border-green-800">
                  <div>
                    <div className="font-medium text-slate-900 dark:text-white">{item.description}</div>
                    <div className="text-xs text-slate-500">{item.productId}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-green-700 dark:text-green-400">x{item.quantity}</div>
                    <div className="text-xs text-slate-500">${item.price.toLocaleString("es-AR")}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );

      case "ITEMS_REMOVED":
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-medium">
              <Minus className="h-4 w-4" />
              <span>Productos Eliminados</span>
            </div>
            <ul className="space-y-1">
              {changes.items.map((item, i) => (
                <li key={i} className="flex flex-col p-2 bg-red-50 dark:bg-red-900/20 rounded-md border border-red-100 dark:border-red-800">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-red-400" />
                    <span className="font-medium text-sm text-slate-700 dark:text-slate-300">
                      {item.description}
                    </span>
                  </div>
                  <span className="ml-6 font-mono text-[10px] text-red-400">
                    CODE: {item.code || item.productId}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );

      case "STATUS_CHANGED":
        return (
          <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800">
            <Info className="h-5 w-5 text-blue-500" />
            <div className="text-sm">
              <span className="text-slate-500">Estado: </span>
              <span className="font-medium text-red-500 uppercase">{changes.from}</span>
              <span className="mx-2 text-slate-400">→</span>
              <span className="font-bold text-green-600 uppercase">{changes.to}</span>
            </div>
          </div>
        );

      case "DISCOUNT_CHANGED":
        return (
          <div className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-100 dark:border-amber-800">
            <Percent className="h-5 w-5 text-amber-500" />
            <div className="text-sm">
              <span className="text-slate-500">Descuento: </span>
              <span className="font-medium text-red-500">{changes.from}%</span>
              <span className="mx-2 text-slate-400">→</span>
              <span className="font-bold text-green-600">{changes.to}%</span>
            </div>
          </div>
        );

      case "CLIENT_CHANGED":
        return (
          <div className="flex items-center gap-3 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-100 dark:border-purple-800">
            <UserPlus className="h-5 w-5 text-purple-500" />
            <div className="text-sm">
              <span className="text-slate-500">Cliente modificado: </span>
              <span className="font-medium text-slate-700 dark:text-slate-300">{changes.from || "Sin cliente"}</span>
              <span className="mx-2 text-slate-400">→</span>
              <span className="font-bold text-slate-900 dark:text-white">{changes.to || "Sin cliente"}</span>
            </div>
          </div>
        );

      default:
        return <div className="text-sm text-slate-500 italic">Tipo de cambio no reconocido: {update.type}</div>;
    }
  };

  if (loading) return <Spinner />;

  if (error) {
    return (
      <div className="text-center py-8 text-red-500" role="alert">
        {error}
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No hay historial de modificaciones para esta venta.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <History className="h-5 w-5" />
        Historial de Modificaciones
      </h3>
      <div className="relative border-l-2 border-slate-200 dark:border-slate-700 ml-4 pl-6 space-y-8">
        {history.map((update) => (
          <div key={update.id} className="relative">
            {/* Timeline Dot */}
            <div className="absolute -left-[31px] top-1.5 h-4 w-4 rounded-full bg-blue-500 border-4 border-white dark:border-slate-900 shadow-sm" />
            
            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 hover:shadow-md transition-shadow">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-4 pb-4 border-b dark:border-slate-700">
                <div className="flex items-center gap-4 text-sm">
                  <span className="flex items-center gap-1.5 text-slate-500">
                    <Calendar className="h-4 w-4" />
                    {format(update.date, "dd/MM/yyyy HH:mm")}
                  </span>
                  <span className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded-md">
                    <UserIcon className="h-4 w-4" />
                    {update.updatedBy.name || update.updatedBy.email}
                  </span>
                </div>
                <div className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-700 text-xs font-bold text-slate-500">
                  v{update.version}
                </div>
              </div>

              <div className="mt-2">
                {renderChanges(update)}
              </div>

              {update.message && (
                <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg text-sm text-slate-600 dark:text-slate-400 italic">
                  &quot;{update.message}&quot;
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SaleHistory;
