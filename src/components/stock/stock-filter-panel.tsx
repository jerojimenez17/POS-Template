"use client";
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Scanner } from "@yudiel/react-qr-scanner";
import { useRouter } from "next/navigation";
import { ScanBarcode, Search, X, FileSpreadsheet, PackagePlus, CheckSquare } from "lucide-react";

interface Props {
  handleOpenModal: () => void;
  handleDescriptionFilter: (filter: string) => void;
  handleOpenExcelModal?: () => void;
  handleOpenSelectionModal?: () => void;
}

const StockFilterPanel = ({
  handleOpenModal,
  handleDescriptionFilter,
  handleOpenExcelModal,
}: Props) => {
  const router = useRouter();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [descriptionFilterInput, setDescriptionFilterInput] = useState("");

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.currentTarget.value;
    setDescriptionFilterInput(value);
    if (value === "") {
      handleDescriptionFilter("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleDescriptionFilter(descriptionFilterInput);
    }
  };

  return (
    <div className="w-full flex flex-col md:flex-row items-center justify-between gap-4 p-4 bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
      
      {/* Search Bar - Takes available width */}
      <div className="relative flex-1 min-w-0">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
        <Input
          className="pl-10 h-10 w-full bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-black dark:focus:ring-white transition-all rounded-lg"
          type="search"
          placeholder="Buscar productos por nombre o código..."
          value={descriptionFilterInput}
          onChange={handleSearchChange}
          onKeyDown={handleKeyDown}
        />
      </div>

      {/* Actions */}
      <div className="flex w-full md:w-auto items-center gap-2 overflow-x-auto pb-2 md:pb-0 hide-scrollbar shrink-0">
        <Button
          onClick={handleOpenModal}
          className="bg-black hover:bg-gray-800 dark:bg-white dark:hover:bg-gray-200 text-white dark:text-gray-900 font-medium rounded-lg h-10 px-4 flex items-center gap-2 transition-all shadow-sm whitespace-nowrap"
        >
          <PackagePlus className="h-4 w-4" />
          <span>Nuevo</span>
        </Button>

        {handleOpenExcelModal && (
          <Button
            onClick={handleOpenExcelModal}
            variant="outline"
            className="border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 h-10 px-3 rounded-lg flex items-center gap-2 transition-colors whitespace-nowrap text-green-700 dark:text-green-400"
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span className="hidden sm:inline">Carga</span>
          </Button>
        )}

        <Button
          variant="outline"
          onClick={() => setScannerOpen(true)}
          className="border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 h-10 px-3 rounded-lg flex items-center gap-2 transition-colors whitespace-nowrap text-gray-600 dark:text-gray-300"
          title="Escanear código de barras"
        >
          <ScanBarcode className="h-4 w-4" />
          <span className="hidden sm:inline">Escanear</span>
        </Button>

         <Button
           variant="secondary"
           onClick={() => router.push("/stock/bulk-update")}
           className="hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium h-10 px-3 rounded-lg flex items-center gap-2 transition-colors whitespace-nowrap"
         >
           <CheckSquare className="h-4 w-4" />
           <span className="hidden sm:inline">Seleccion Multiple</span>
         </Button>
      </div>

      {/* Scanner Modal Overlay */}
      {scannerOpen && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4">
          <Button
            variant="ghost"
            className="absolute top-4 right-4 text-white hover:bg-white/20 rounded-full h-10 w-10 p-0"
            onClick={() => setScannerOpen(false)}
          >
            <X className="h-6 w-6" />
          </Button>
          
          <div className="w-full max-w-md aspect-square bg-black rounded-2xl overflow-hidden relative border border-white/20 shadow-2xl">
            <Scanner
              formats={["code_128", "codabar", "qr_code", "ean_13", "ean_8"]}
              onScan={(result) => {
                if (result && result.length > 0) {
                  const rawValue = result[0].rawValue;
                  setDescriptionFilterInput(rawValue);
                  handleDescriptionFilter(rawValue);
                  setScannerOpen(false);
                }
              }}
            />
            <div className="absolute inset-0 border-2 border-white/30 pointer-events-none rounded-2xl">
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-48 h-48 border-2 border-white/50 rounded-lg"></div>
            </div>
          </div>
          <p className="text-white mt-4 text-center font-medium">Apunta la cámara al código de barras</p>
        </div>
      )}
    </div>
  );
};

export default StockFilterPanel;
