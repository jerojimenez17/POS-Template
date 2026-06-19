"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Search } from "lucide-react";

const SearchBillHeader = () => {
  const router = useRouter();

  return (
    <header className="p-4 md:p-6 border-b bg-white dark:bg-gray-900 flex items-center justify-between gap-4 shrink-0">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push("/")} title="Volver">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <Search className="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight">Consultar Ventas</h1>
            <p className="text-sm text-gray-500 hidden sm:block">Buscá y filtrá comprobantes emitidos</p>
          </div>
        </div>
      </div>
    </header>
  );
};

export default SearchBillHeader;
