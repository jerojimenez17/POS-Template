"use client";

import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition, useState } from "react";

export default function SearchLedger() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [term, setTerm] = useState(searchParams.get("search") || "");

  const handleSearch = (value: string) => {
    setTerm(value);
    startTransition(() => {
      const params = new URLSearchParams(searchParams);
      if (value) {
        params.set("search", value);
      } else {
        params.delete("search");
      }
      router.replace(`${pathname}?${params.toString()}`);
    });
  };

  return (
    <div className="relative w-full md:w-1/3">
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <Search className={`h-4 w-4 ${isPending ? "text-blue-500" : "text-gray-400"}`} />
      </div>
      <Input
        type="search"
        placeholder="Buscar por nombre de cliente..."
        className="pl-10 rounded-full"
        value={term}
        onChange={(e) => handleSearch(e.target.value)}
      />
    </div>
  );
}
