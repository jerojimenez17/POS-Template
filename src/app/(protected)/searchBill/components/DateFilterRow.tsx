"use client";

import { Input } from "@/components/ui/input";

interface DateFilterRowProps {
  startDate: string;
  setStartDate: (value: string) => void;
  startTime: string;
  setStartTime: (value: string) => void;
  endDate: string;
  setEndDate: (value: string) => void;
  endTime: string;
  setEndTime: (value: string) => void;
  seller: string;
  setSeller: (value: string) => void;
  sellers: string[];
}

export default function DateFilterRow({
  startDate,
  setStartDate,
  startTime,
  setStartTime,
  endDate,
  setEndDate,
  endTime,
  setEndTime,
  seller,
  setSeller,
  sellers,
}: DateFilterRowProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">Desde Fecha</label>
        <Input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="text-sm h-9"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">Desde Hora</label>
        <Input
          type="time"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          className="text-sm h-9"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">Hasta Fecha</label>
        <Input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="text-sm h-9"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">Hasta Hora</label>
        <Input
          type="time"
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
          className="text-sm h-9"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">Vendedor</label>
        <select
          className="h-9 px-3 rounded-md border border-slate-200 bg-white text-sm"
          value={seller}
          onChange={(e) => setSeller(e.target.value)}
        >
          <option value="">Todos</option>
          {sellers.map((s) => (
            <option key={s} value={s}>{s.split("@")[0]}</option>
          ))}
        </select>
      </div>
    </div>
  );
}