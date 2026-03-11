"use client";

import React, { useState, useTransition } from "react";
import BillState from "@/models/BillState";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import Select from "./Select";
import { paidMethods } from "@/utils/PaidMethods";
import { updateSaleAction } from "@/actions/sales";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { ArrowLeft, Edit2, Save, X, Calendar, User, CreditCard, DollarSign, History } from "lucide-react";

interface SaleDetailProps {
  sale: BillState;
  isAdmin?: boolean;
}

const SaleDetail = ({ sale, isAdmin }: SaleDetailProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const [formData, setFormData] = useState({
    paidMethod: sale.paidMethod || "Efectivo",
    seller: sale.seller || "",
    totalWithDiscount: sale.totalWithDiscount || sale.total,
  });

  const handleSave = () => {
    startTransition(async () => {
      const res = await updateSaleAction(sale.id, formData);
      if (res.success) {
        toast.success(res.success);
        setIsEditing(false);
        router.refresh();
      } else {
        toast.error(res.error || "Error al actualizar");
      }
    });
  };

  const isUpdated = sale.updatedAt && 
    new Date(sale.updatedAt).getTime() - new Date(sale.date).getTime() > 60000; // More than 1 minute difference

  return (
    <div className="w-full bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-100 dark:border-gray-800 overflow-hidden">
      {/* Header */}
      <div className="bg-slate-50 dark:bg-slate-900/40 px-6 py-4 flex items-center justify-between border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => router.back()}
            className="text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
              Venta #{sale.id.slice(-6)}
            </h1>
            {isUpdated && (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                <History className="h-3 w-3" /> Editada
              </span>
            )}
          </div>
        </div>

        {isAdmin && (
          <div className="flex gap-2">
            {!isEditing ? (
              <Button 
                onClick={() => setIsEditing(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2 shadow-sm"
              >
                <Edit2 className="h-4 w-4" /> Editar
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => setIsEditing(false)}
                  disabled={isPending}
                  className="gap-2 border-slate-200 dark:border-slate-700"
                >
                  <X className="h-4 w-4" /> Cancelar
                </Button>
                <Button 
                  onClick={handleSave}
                  disabled={isPending}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-sm"
                >
                    <Save className="h-4 w-4" /> {isPending ? "Guardando..." : "Guardar"}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Left Column: Info Card */}
        <div className="space-y-6">
          <div className="bg-slate-50/50 dark:bg-slate-800/30 p-6 rounded-xl border border-slate-100 dark:border-slate-800 space-y-5">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Información General</h2>
            
            <div className="flex items-center gap-4 text-slate-700 dark:text-slate-300">
              <div className="p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                <Calendar className="h-5 w-5 text-indigo-500" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-tight">Fecha de Venta</p>
                <p className="font-medium text-slate-900 dark:text-slate-100">{new Date(sale.date).toLocaleString('es-AR')}</p>
              </div>
            </div>

            <div className="flex items-center gap-4 text-slate-700 dark:text-slate-300">
                <div className="p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                    <User className="h-5 w-5 text-indigo-500" />
                </div>
              <div className="flex-1">
                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-tight">Vendedor</p>
                {isEditing ? (
                  <Input 
                    value={formData.seller}
                    onChange={(e) => setFormData({...formData, seller: e.target.value})}
                    className="mt-1 border-slate-200 dark:border-slate-700 focus:ring-indigo-500"
                  />
                ) : (
                  <p className="font-medium text-slate-900 dark:text-slate-100">{sale.seller}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4 text-slate-700 dark:text-slate-300">
                <div className="p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                    <CreditCard className="h-5 w-5 text-indigo-500" />
                </div>
              <div className="flex-1">
                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-tight">Medio de Pago</p>
                {isEditing ? (
                  <div className="mt-1">
                    <Select 
                      id="paidMethod"
                      value={formData.paidMethod}
                      options={paidMethods.map(m => m.name)}
                      handleChange={(e) => setFormData({...formData, paidMethod: e.target.value})}
                      active={true}
                    />
                  </div>
                ) : (
                  <p className="font-medium text-slate-900 dark:text-slate-100 capitalize">{sale.paidMethod}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4 text-slate-700 dark:text-slate-300">
                <div className="p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                    <DollarSign className="h-5 w-5 text-indigo-500" />
                </div>
              <div className="flex-1">
                <p className="text-[10px] uppercase font-bold text-slate-400 tracking-tight">Total Cobrado</p>
                {isEditing ? (
                  <Input 
                    type="number"
                    value={formData.totalWithDiscount}
                    onChange={(e) => setFormData({...formData, totalWithDiscount: Number(e.target.value)})}
                    className="mt-1 border-slate-200 dark:border-slate-700 focus:ring-indigo-500"
                  />
                ) : (
                  <p className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                    ${formData.totalWithDiscount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </p>
                )}
              </div>
            </div>

            {isUpdated && (
              <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                <p className="text-[11px] text-amber-600 dark:text-amber-400 font-bold italic flex items-center gap-2">
                  <span className="h-1.5 w-1.5 bg-amber-500 rounded-full animate-pulse"></span>
                  Actualizada: {new Date(sale.updatedAt!).toLocaleDateString('es-AR')} - {new Date(sale.updatedAt!).toLocaleTimeString('es-AR')}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Products Table */}
        <div className="space-y-4">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Productos Vendidos</h2>
          <div className="border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-5 py-4 font-bold text-[10px] uppercase tracking-wider">Producto</th>
                  <th className="px-5 py-4 font-bold text-[10px] uppercase tracking-wider text-center">Cant.</th>
                  <th className="px-5 py-4 font-bold text-[10px] uppercase tracking-wider text-right">Precio</th>
                  <th className="px-5 py-4 font-bold text-[10px] uppercase tracking-wider text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800 bg-white dark:bg-transparent">
                {sale.products.map((product, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-900 dark:text-slate-100">{product.description}</p>
                      <p className="text-[10px] font-mono text-slate-400 mt-0.5">{product.code}</p>
                    </td>
                    <td className="px-5 py-4 text-center text-slate-600 dark:text-slate-400 font-medium">
                      {product.amount}
                    </td>
                    <td className="px-5 py-4 text-right text-slate-600 dark:text-slate-400 font-medium whitespace-nowrap">
                      ${product.salePrice?.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-5 py-4 text-right font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      ${((product.salePrice || 0) * product.amount).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 dark:bg-slate-900/50">
                <tr>
                  <td colSpan={3} className="px-5 py-5 text-right font-bold text-slate-400 text-[10px] uppercase">Suma Total:</td>
                  <td className="px-5 py-5 text-right font-black text-indigo-600 dark:text-indigo-400 text-lg">
                    ${sale.totalWithDiscount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          {sale.discount > 0 && (
            <div className="flex justify-end p-1">
                <span className="bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
                    Descuento Aplicado: {sale.discount}%
                </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SaleDetail;
