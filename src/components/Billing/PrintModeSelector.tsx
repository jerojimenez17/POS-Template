"use client";

import { useContext } from "react";
import { BillContext, PrintMode } from "@/context/BillContext";
import { Printer, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

export default function PrintModeSelector() {
  const { printMode, setPrintMode, qzTrayActive, setQzTrayActive } = useContext(BillContext);

  const toggle = (mode: PrintMode) => {
    setPrintMode(mode);
  };

  return (
    <div className="flex flex-col sm:flex-row items-center gap-2">
      <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
        <button
          onClick={() => toggle("thermal")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
            printMode === "thermal"
              ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
          )}
          title="Impresión Térmica"
        >
          <Printer className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Thermal</span>
        </button>
        <button
          onClick={() => toggle("pdf")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
            printMode === "pdf"
              ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
          )}
          title="Generar PDF"
        >
          <FileText className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">PDF</span>
        </button>
      </div>

      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg">
        <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">QZ Tray</span>
        <button
          onClick={() => setQzTrayActive(!qzTrayActive)}
          className={cn(
            "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            qzTrayActive ? "bg-green-500" : "bg-slate-300 dark:bg-slate-600"
          )}
        >
          <span
            className={cn(
              "pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform",
              qzTrayActive ? "translate-x-4" : "translate-x-1"
            )}
          />
        </button>
      </div>
    </div>
  );
}
