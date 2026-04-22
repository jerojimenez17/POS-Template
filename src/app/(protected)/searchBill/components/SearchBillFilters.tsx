"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getUniqueSellersAction } from "@/actions/sales";
import DateFilterRow from "./DateFilterRow";
import FilterChipGroup from "./FilterChipGroup";
import ActiveFiltersSummary from "./ActiveFiltersSummary";

interface SearchBillFiltersProps {
  onApply: (filters: {
    seller: string;
    startDate: Date | null;
    endDate: Date | null;
    saleTypes: string[];
    paymentMethods: string[];
  }) => void;
}

// Payment methods in Argentina - MUST match database values exactly
// Sorted alphabetically: Ahora 3, Ahora 6, Cuenta DNI, Debito, Efectivo, Transferencia, 1 pago
const PAYMENT_METHODS = [
  "Ahora 3",
  "Ahora 6",
  "Cuenta DNI",
  "Debito",
  "Efectivo",
  "Transferencia",
  "1 pago",
].sort();

// Display names for UI (different from DB values)
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  "Ahora 3": "Ahora 3",
  "Ahora 6": "Ahora 6",
  "Cuenta DNI": "Cuenta DNI",
  "Debito": "Débito",
  "Efectivo": "Efectivo",
  "Transferencia": "Transferencia",
  "1 pago": "1 Pago",
};

// Sale types - Factura has CAE, Remito does not
const SALE_TYPES = ["Factura", "Remito"];

// Helper to format date as YYYY-MM-DD for input value
const formatDateForInput = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Helper to format time as HH:mm for input value
const formatTimeForInput = (date: Date): string => {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

// Get default dates
const getDefaultDates = () => {
  const now = new Date();
  return { today: formatDateForInput(now), currentTime: formatTimeForInput(now) };
};

export default function SearchBillFilters({ onApply }: SearchBillFiltersProps) {
  const [sellers, setSellers] = useState<string[]>([]);
  const [seller, setSeller] = useState("");
  const [defaults] = useState(() => getDefaultDates());
  const [startDate, setStartDate] = useState(defaults.today);
  const [startTime, setStartTime] = useState("00:00");
  const [endDate, setEndDate] = useState(defaults.today);
  const [endTime, setEndTime] = useState(defaults.currentTime);
  const [saleTypes, setSaleTypes] = useState<string[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<string[]>([]);

  // Load sellers on mount
  useEffect(() => {
    getUniqueSellersAction().then(setSellers);
  }, []);

  // Apply filters when any filter changes (debounced)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const startDateTime = startDate
        ? new Date(`${startDate}T${startTime}:00`)
        : null;
      const endDateTime = endDate
        ? new Date(`${endDate}T${endTime}:59`)
        : null;

      onApply({
        seller,
        startDate: startDateTime,
        endDate: endDateTime,
        saleTypes,
        paymentMethods,
      });
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [seller, startDate, startTime, endDate, endTime, saleTypes, paymentMethods, onApply]);

  const toggleSaleType = (type: string) => {
    setSaleTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const togglePaymentMethod = (method: string) => {
    setPaymentMethods((prev) =>
      prev.includes(method) ? prev.filter((m) => m !== method) : [...prev, method]
    );
  };

  const handleReset = () => {
    setSeller("");
    setStartDate(defaults.today);
    setStartTime("00:00");
    setEndDate(defaults.today);
    setEndTime(defaults.currentTime);
    setSaleTypes([]);
    setPaymentMethods([]);
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">Filtros de Búsqueda</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <DateFilterRow
          startDate={startDate}
          setStartDate={setStartDate}
          startTime={startTime}
          setStartTime={setStartTime}
          endDate={endDate}
          setEndDate={setEndDate}
          endTime={endTime}
          setEndTime={setEndTime}
          seller={seller}
          setSeller={setSeller}
          sellers={sellers}
        />
        <FilterChipGroup
          label="Tipo de Venta"
          options={SALE_TYPES}
          selected={saleTypes}
          onToggle={toggleSaleType}
          variant="default"
        />
        <FilterChipGroup
          label="Medios de Pago"
          options={PAYMENT_METHODS}
          selected={paymentMethods}
          onToggle={togglePaymentMethod}
          variant="secondary"
          labelsMap={PAYMENT_METHOD_LABELS}
        />
        <ActiveFiltersSummary
          seller={seller}
          startDate={startDate}
          endDate={endDate}
          saleTypes={saleTypes}
          paymentMethods={paymentMethods}
          paymentMethodLabels={PAYMENT_METHOD_LABELS}
          onReset={handleReset}
        />
      </CardContent>
    </Card>
  );
}