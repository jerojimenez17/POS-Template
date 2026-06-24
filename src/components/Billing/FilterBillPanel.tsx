"use client";
import React, { useContext, useEffect, useState } from "react";
import { FiltersContext } from "@/context/FiltersContext/FiltersContext";
import { getUniqueSellersAction } from "@/actions/sales";
import {
  Filter,
  ChevronDown,
  ChevronUp,
  Check,
  Banknote,
  CreditCard,
  Layers2,
  Smartphone,
  ArrowLeftRight,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const FilterToggleButton = ({
  onClick,
  isOpen,
  count,
}: {
  onClick: () => void;
  isOpen: boolean;
  count: number;
}) => (
  <button
    onClick={onClick}
    className={cn(
      "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border",
      isOpen || count > 0
        ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800"
        : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
    )}
  >
    <Filter className="h-4 w-4" />
    <span>Filtros</span>
    {count > 0 && (
      <span className="ml-1 bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
        {count}
      </span>
    )}
    {isOpen ? (
      <ChevronUp className="h-4 w-4 ml-1" />
    ) : (
      <ChevronDown className="h-4 w-4 ml-1" />
    )}
  </button>
);

/** Segmented multi-toggle: cada opción es independiente (ambas pueden estar activas) */
const DocTypeToggle = ({
  options,
}: {
  options: { label: string; active: boolean; onClick: () => void }[];
}) => (
  <div className="inline-flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-700/60 rounded-lg">
    {options.map((opt) => (
      <button
        key={opt.label}
        onClick={opt.onClick}
        className={cn(
          "relative px-4 py-1.5 rounded-md text-xs font-semibold transition-all duration-150 select-none",
          opt.active
            ? "bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm ring-1 ring-gray-200 dark:ring-gray-600"
            : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        )}
      >
        {opt.active && (
          <span className="absolute -top-1 -right-1 h-3 w-3 flex items-center justify-center bg-blue-500 rounded-full">
            <Check className="h-2 w-2 text-white" strokeWidth={3} />
          </span>
        )}
        {opt.label}
      </button>
    ))}
  </div>
);

/** Chip de medio de pago — con ícono, color propio y glow al activar */
const PaymentChip = ({
  label,
  icon: Icon,
  active,
  onClick,
  color,
}: {
  label: string;
  icon: LucideIcon;
  active: boolean;
  onClick: () => void;
  color: string;
}) => (
  <button
    onClick={onClick}
    className={cn(
      "group inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold",
      "border transition-all duration-150 select-none",
      "hover:scale-[1.04] active:scale-[0.97]",
      active
        ? `${color} shadow-md`
        : "bg-white dark:bg-gray-800/80 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
    )}
  >
    <Icon
      className={cn(
        "h-3.5 w-3.5 transition-transform duration-150",
        active ? "" : "opacity-60 group-hover:opacity-100"
      )}
      strokeWidth={2.2}
    />
    {label}
    {active && (
      <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white/25">
        <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
      </span>
    )}
  </button>
);

const FilterBillPanel = () => {
  const {
    filtersState,
    switchAhora3,
    switchEfectivo,
    switchAhora6,
    switchDebito,
    switchRemito,
    switchCuentaDNI,
    switchFacturaC,
    switchTransferencia,
    switchUnPago,
    startDate,
    disableSeller,
    seller,
    endDate,
    resetFilters,
  } = useContext(FiltersContext);

  const [sellers, setSellers] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const activeFilterCount = [
    filtersState.FacturaC.active,
    filtersState.Remito.active,
    filtersState.startDate.active,
    filtersState.endDate.active,
    filtersState.Seller.active,
    ...Object.entries(filtersState)
      .filter(([k]) =>
        ["Efectivo", "Debito", "UnPago", "Ahora3", "Ahora6", "CuentaDNI", "Transferencia"].includes(k)
      )
      .map(([, v]) => (v as { active: boolean }).active),
  ].filter(Boolean).length;

  useEffect(() => {
    getUniqueSellersAction().then((uniqueSellers) => {
      setSellers(uniqueSellers);
    });
  }, []);

  const paymentMethods = [
    {
      label: "Efectivo",
      icon: Banknote,
      onClick: switchEfectivo,
      active: filtersState.Efectivo.active,
      color: "bg-emerald-500 text-white border-emerald-500 ring-2 ring-emerald-200 dark:ring-emerald-900/60",
    },
    {
      label: "Débito",
      icon: CreditCard,
      onClick: switchDebito,
      active: filtersState.Debito.active,
      color: "bg-blue-500 text-white border-blue-500 ring-2 ring-blue-200 dark:ring-blue-900/60",
    },
    {
      label: "1 Pago",
      icon: CreditCard,
      onClick: switchUnPago,
      active: filtersState.UnPago.active,
      color: "bg-violet-500 text-white border-violet-500 ring-2 ring-violet-200 dark:ring-violet-900/60",
    },
    {
      label: "Ahora 3",
      icon: Layers2,
      onClick: switchAhora3,
      active: filtersState.Ahora3.active,
      color: "bg-amber-500 text-white border-amber-500 ring-2 ring-amber-200 dark:ring-amber-900/60",
    },
    {
      label: "Ahora 6",
      icon: Layers2,
      onClick: switchAhora6,
      active: filtersState.Ahora6.active,
      color: "bg-orange-500 text-white border-orange-500 ring-2 ring-orange-200 dark:ring-orange-900/60",
    },
    {
      label: "Cuenta DNI",
      icon: Smartphone,
      onClick: switchCuentaDNI,
      active: filtersState.CuentaDNI.active,
      color: "bg-sky-500 text-white border-sky-500 ring-2 ring-sky-200 dark:ring-sky-900/60",
    },
    {
      label: "Transferencia",
      icon: ArrowLeftRight,
      onClick: switchTransferencia,
      active: filtersState.Transferencia.active,
      color: "bg-rose-500 text-white border-rose-500 ring-2 ring-rose-200 dark:ring-rose-900/60",
    },
  ];

  return (
    <div className="w-full">
      {/* Mobile toggle */}
      <div className="md:hidden flex items-center justify-between mb-3">
        <FilterToggleButton
          onClick={() => setIsOpen(!isOpen)}
          isOpen={isOpen}
          count={activeFilterCount}
        />
        {activeFilterCount > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">
              {activeFilterCount} filtro{activeFilterCount !== 1 ? "s" : ""} activo
              {activeFilterCount !== 1 ? "s" : ""}
            </span>
            <button
              onClick={resetFilters}
              className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium transition-colors"
            >
              Limpiar
            </button>
          </div>
        )}
      </div>

      {/* Filters content */}
      <div
        className={cn(
          "bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden transition-all duration-200",
          "md:block",
          isOpen ? "block" : "hidden"
        )}
      >
        {/* Desktop title bar */}
        <div className="hidden md:flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Filtros
            </span>
          </div>
          {activeFilterCount > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">
                {activeFilterCount} filtro{activeFilterCount !== 1 ? "s" : ""} activo
                {activeFilterCount !== 1 ? "s" : ""}
              </span>
              <button
                onClick={resetFilters}
                className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium transition-colors"
              >
                Limpiar
              </button>
            </div>
          )}
        </div>

        <div className="p-5 space-y-5">
          {/* Top row: Seller + Document types */}
          <div className="flex flex-col md:flex-row gap-5 md:items-end">
            {/* Seller — Radix Select */}
            <div className="w-full md:w-64">
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 block">
                Vendedor
              </label>
              <Select
                value={filtersState.Seller.active ? filtersState.Seller.filter : "__all__"}
                onValueChange={(val) => {
                  if (val === "__all__") disableSeller();
                  else seller(val);
                }}
              >
                <SelectTrigger
                  id="SellersSelector"
                  className="w-full bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-100"
                >
                  <SelectValue placeholder="Todos los vendedores" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos los vendedores</SelectItem>
                  {sellers.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.split("@")[0]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Document type — dual segmented toggle */}
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 block">
                Tipo de Comprobante
              </label>
              <DocTypeToggle
                options={[
                  {
                    label: "Facturas",
                    active: filtersState.FacturaC.active,
                    onClick: switchFacturaC,
                  },
                  {
                    label: "Remitos",
                    active: filtersState.Remito.active,
                    onClick: switchRemito,
                  },
                ]}
              />
            </div>
          </div>

          {/* Bottom row: Dates + Payment methods */}
          <div className="flex flex-col md:flex-row gap-5">
            {/* Date filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Desde
                </label>
                <div className="flex items-center gap-2 bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-gray-100 focus-within:ring-2 focus-within:ring-blue-500 transition-shadow w-full min-w-[160px]">
                  <input
                    type="date"
                    value={
                      filtersState.startDate.date instanceof Date && !isNaN(filtersState.startDate.date.getTime())
                        ? filtersState.startDate.date.toISOString().split("T")[0]
                        : ""
                    }
                    onChange={(e) => startDate(new Date(e.target.value + "T00:00:00"))}
                    className="w-full bg-transparent outline-none text-sm text-gray-900 dark:text-gray-100 [color-scheme:light] dark:[color-scheme:dark] [&::-webkit-calendar-picker-indicator]:opacity-60 [&::-webkit-calendar-picker-indicator]:hover:opacity-100 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Hasta
                </label>
                <div className="flex items-center gap-2 bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-gray-100 focus-within:ring-2 focus-within:ring-blue-500 transition-shadow w-full min-w-[160px]">
                  <input
                    type="date"
                    value={
                      filtersState.endDate.date instanceof Date && !isNaN(filtersState.endDate.date.getTime())
                        ? filtersState.endDate.date.toISOString().split("T")[0]
                        : ""
                    }
                    onChange={(e) => endDate(new Date(e.target.value + "T00:00:00"))}
                    className="w-full bg-transparent outline-none text-sm text-gray-900 dark:text-gray-100 [color-scheme:light] dark:[color-scheme:dark] [&::-webkit-calendar-picker-indicator]:opacity-60 [&::-webkit-calendar-picker-indicator]:hover:opacity-100 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Payment methods */}
            <div className="flex-1">
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">
                Medios de Pago
              </label>
              <div className="flex flex-wrap gap-2">
                {paymentMethods.map((pm) => (
                  <PaymentChip
                    key={pm.label}
                    label={pm.label}
                    icon={pm.icon}
                    active={pm.active}
                    onClick={pm.onClick}
                    color={pm.color}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FilterBillPanel;
