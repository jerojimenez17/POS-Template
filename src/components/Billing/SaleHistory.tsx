"use client";

import { useEffect, useState } from "react";
import { getSaleHistoryAction, OrderUpdateWithUser } from "@/actions/sales";
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

  useEffect(() => {
    const fetchHistory = async () => {
      const data = await getSaleHistoryAction(saleId);
      setHistory(data);
      setLoading(false);
    };
    fetchHistory();
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

            {/* Bill type changes */}
            {changes.billTypeChanged && (
              <div className="flex items-start gap-3 p-3 bg-violet-50 dark:bg-violet-900/20 rounded-lg border border-violet-100 dark:border-violet-800">
                <FileText className="h-5 w-5 text-violet-500 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <span className="font-medium text-violet-700 dark:text-violet-300">Tipo comprobante actualizado</span>
                  <div className="text-slate-600 dark:text-slate-400 mt-1">
                    <span className="font-medium text-slate-700 dark:text-slate-300">{changes.billTypeChanged.from || "—"}</span>
                    <span className="mx-1.5 text-slate-400">→</span>
                    <span className="font-bold text-violet-700 dark:text-violet-300">{changes.billTypeChanged.to}</span>
                  </div>
                </div>
              </div>
            )}

            {/* IVA changes */}
            {changes.ivaChanged && (
              <div className="flex items-start gap-3 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-100 dark:border-purple-800">
                <FileText className="h-5 w-5 text-purple-500 shrink-0 mt-0.5" />
                <div className="text-sm space-y-1">
                  <span className="font-medium text-purple-700 dark:text-purple-300">Condición IVA actualizada</span>
                  <div className="text-slate-600 dark:text-slate-400">
                    <span className="block">
                      Condición: <span className="font-medium text-slate-700 dark:text-slate-300">{changes.ivaChanged.from.condition || "Consumidor Final"}</span>
                      <span className="mx-1.5 text-slate-400">→</span>
                      <span className="font-bold text-purple-700 dark:text-purple-300">{changes.ivaChanged.to.condition || "Consumidor Final"}</span>
                    </span>
                    {changes.ivaChanged.from.documentNumber !== changes.ivaChanged.to.documentNumber && (
                      <span className="block">
                        Documento: <span className="font-medium text-slate-700 dark:text-slate-300">{changes.ivaChanged.from.documentNumber || "—"}</span>
                        <span className="mx-1.5 text-slate-400">→</span>
                        <span className="font-bold text-purple-700 dark:text-purple-300">{changes.ivaChanged.to.documentNumber || "—"}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Payment changes */}
            {changes.paymentChanged && (
              <div className="flex items-start gap-3 p-3 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg border border-cyan-100 dark:border-cyan-800">
                <Receipt className="h-5 w-5 text-cyan-500 shrink-0 mt-0.5" />
                <div className="text-sm space-y-1">
                  <span className="font-medium text-cyan-700 dark:text-cyan-300">Pago actualizado</span>
                  <div className="text-slate-600 dark:text-slate-400">
                    <span className="block">
                      Método: <span className="font-medium text-slate-700 dark:text-slate-300">{changes.paymentChanged.from.method || "—"}</span>
                      <span className="mx-1.5 text-slate-400">→</span>
                      <span className="font-bold text-cyan-700 dark:text-cyan-300">{changes.paymentChanged.to.method || "—"}</span>
                    </span>
                    {changes.paymentChanged.from.twoMethods !== changes.paymentChanged.to.twoMethods && (
                      <span className="block text-xs">
                        Pago dividido: {changes.paymentChanged.from.twoMethods ? "Sí" : "No"} → {changes.paymentChanged.to.twoMethods ? "Sí" : "No"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Discount changes */}
            {changes.discountChanged && (
              <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-100 dark:border-amber-800">
                <Percent className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <span className="font-medium text-amber-700 dark:text-amber-300">Descuento actualizado</span>
                  <div className="text-slate-600 dark:text-slate-400 mt-1">
                    <span className="font-medium text-slate-700 dark:text-slate-300">{changes.discountChanged.from}%</span>
                    <span className="mx-1.5 text-slate-400">→</span>
                    <span className="font-bold text-amber-700 dark:text-amber-300">{changes.discountChanged.to}%</span>
                  </div>
                </div>
              </div>
            )}

            {/* Fallback */}
            {changedItems.length === 0 && !changes.billTypeChanged && !changes.ivaChanged && !changes.paymentChanged && !changes.discountChanged && (
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
