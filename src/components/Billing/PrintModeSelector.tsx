"use client";

import { useContext } from "react";
import { BillContext, PrintMode } from "@/context/BillContext";
import { Printer, FileText, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModeButtonProps {
  mode: PrintMode;
  current: PrintMode;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}

const ModeButton = ({ mode, current, icon, label, onClick }: ModeButtonProps) => (
  <button
    onClick={onClick}
    className={cn(
      "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-all first:rounded-l-md last:rounded-r-md",
      mode === current
        ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm z-10"
        : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
    )}
    title={label}
  >
    {icon}
    <span className="hidden sm:inline">{mode === "thermal" ? "Térmica" : "PDF"}</span>
  </button>
);

export default function PrintModeSelector() {
  const { printMode, setPrintMode, qzTrayActive, setQzTrayActive } = useContext(BillContext);

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center bg-gray-100 dark:bg-gray-700/50 rounded-md p-0.5">
        <ModeButton
          mode="thermal"
          current={printMode}
          icon={<Printer className="h-3.5 w-3.5" />}
          label="Impresión Térmica"
          onClick={() => setPrintMode("thermal")}
        />
        <ModeButton
          mode="pdf"
          current={printMode}
          icon={<FileText className="h-3.5 w-3.5" />}
          label="Generar PDF"
          onClick={() => setPrintMode("pdf")}
        />
      </div>
      <button
        onClick={() => setQzTrayActive(!qzTrayActive)}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all",
          qzTrayActive
            ? "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400"
            : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
        )}
        title={qzTrayActive ? "QZ Tray conectado" : "QZ Tray desconectado"}
      >
        <Monitor className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">QZ</span>
      </button>
    </div>
  );
}
