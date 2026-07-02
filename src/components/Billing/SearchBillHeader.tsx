"use client";

import { Button } from "@/components/ui/button";
import { ArrowLeft, Search } from "lucide-react";
import Link from "next/link";
import { useContext, useEffect } from "react";
import { FiltersContext } from "@/context/FiltersContext/FiltersContext";

interface SearchBillHeaderProps {
  initialParams?: { from?: string; to?: string; showAll?: string };
}

const SearchBillHeader = ({ initialParams }: SearchBillHeaderProps) => {
  const { initFromUrl } = useContext(FiltersContext);

  const from = initialParams?.from;
  const to = initialParams?.to;
  const showAll = initialParams?.showAll === "true";

  useEffect(() => {
    if (!from && !to && !showAll) return;

    const parsed: { startDate?: Date; endDate?: Date; showAll?: boolean } = {};

    if (from) {
      const fromDate = new Date(from + "T00:00:00");
      if (!isNaN(fromDate.getTime())) {
        parsed.startDate = fromDate;
      }
    }

    if (to) {
      const toDate = new Date(to + "T00:00:00");
      if (!isNaN(toDate.getTime())) {
        // Sumar 1 día para incluir todo el día (el filtro usa <= endDate)
        toDate.setDate(toDate.getDate() + 1);
        parsed.endDate = toDate;
      }
    }

    if (showAll) {
      parsed.showAll = true;
    }

    initFromUrl(parsed);
  }, [from, to, showAll, initFromUrl]);

  return (
    <header className="p-4 md:p-6 border-b bg-white dark:bg-gray-900 flex items-center justify-between gap-4 shrink-0">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/report" title="Volver">
            <ArrowLeft className="h-5 w-5" />
          </Link>
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
