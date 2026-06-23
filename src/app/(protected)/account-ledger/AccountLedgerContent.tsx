"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { getUnpaidOrders } from "@/actions/unpaid-orders";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  User,
  Loader2,
} from "lucide-react";
import { LocalDate } from "@/components/ui/LocalDate";
import { pusherClient } from "@/lib/pusher-client";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "inpago" | "pago" | "pendiente";

interface OrderWithClient {
  id: string;
  date: Date;
  total: number;
  status: string;
  paidStatus: string;
  clientId: string | null;
  client: { id: string; name: string | null } | null;
}

const ITEMS_PER_PAGE = 25;

const TABS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "pendiente", label: "Por Confirmar" },
  { value: "inpago", label: "Pendientes" },
  { value: "pago", label: "Pagados" },
];

export default function AccountLedgerContent({
  businessId,
}: {
  businessId: string;
}) {
  const router = useRouter();
  const [allOrders, setAllOrders] = useState<OrderWithClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [refreshToggle, setRefreshToggle] = useState(0);

  // Fetch all orders
  useEffect(() => {
    let cancelled = false;
    getUnpaidOrders({ businessId, status: "all" }).then((result) => {
      if (cancelled) return;
      const data = result as { success: boolean; data?: OrderWithClient[] };
      if (data.success) {
        setAllOrders(data.data || []);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [businessId, refreshToggle]);

  // Pusher listener for real-time updates
  useEffect(() => {
    if (!businessId) return;
    const channelName = `orders-${businessId}`;
    const channel = pusherClient.subscribe(channelName);

    const handleUpdate = () => {
      setRefreshToggle((prev) => prev + 1);
    };

    channel.bind("orders-update", handleUpdate);
    return () => {
      channel.unbind("orders-update", handleUpdate);
    };
  }, [businessId]);

  // Debounce search + reset page
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Filter by tab + search + sort
  const filteredOrders = useMemo(() => {
    let orders = allOrders;

    // Status filter
    if (activeTab !== "all") {
      if (activeTab === "pendiente") {
        orders = orders.filter((o) => o.status === "pendiente");
      } else {
        orders = orders.filter(
          (o) => o.status !== "pendiente" && o.paidStatus === activeTab
        );
      }
    }

    // Search filter
    if (debouncedSearch) {
      const term = debouncedSearch.toLowerCase();
      orders = orders.filter(
        (o) => o.client?.name?.toLowerCase().includes(term)
      );
    }

    // Sort alphabetically by client name
    return orders.sort((a, b) => {
      const nameA = a.client?.name?.toLowerCase() || "";
      const nameB = b.client?.name?.toLowerCase() || "";
      if (nameA < nameB) return -1;
      if (nameA > nameB) return 1;
      return 0;
    });
  }, [allOrders, activeTab, debouncedSearch]);

  // Paginate
  const totalPages = Math.ceil(filteredOrders.length / ITEMS_PER_PAGE);
  const paginatedOrders = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return filteredOrders.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredOrders, page]);

  // Status pill component
  const StatusPill = ({
    status,
    paidStatus,
  }: {
    status: string;
    paidStatus: string;
  }) => {
    if (status === "pendiente") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400 border border-orange-200 dark:border-orange-800">
          <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
          Por Confirmar
        </span>
      );
    }
    switch (paidStatus) {
      case "inpago":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border border-red-200 dark:border-red-800">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
            Pendiente
          </span>
        );
      case "pago":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border border-green-200 dark:border-green-800">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            Pagado
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-50 text-gray-700 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
            {paidStatus}
          </span>
        );
    }
  };

  return (
    <>
      {/* Search + Tabs row */}
      <div className="flex flex-col md:flex-row items-start md:items-center gap-3">
        <div className="relative w-full md:w-60">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            type="search"
            placeholder="Buscar por cliente..."
            className="pl-10 h-9 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 rounded-lg text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="inline-flex items-center p-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg gap-0.5">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => {
                setActiveTab(tab.value);
                setPage(1);
              }}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150 whitespace-nowrap",
                activeTab === tab.value
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="mt-4">
        {loading ? (
          <div className="flex items-center justify-center py-12 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700">
            {debouncedSearch
              ? "No se encontraron órdenes para este cliente"
              : "No hay órdenes en esta categoría"}
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                  <TableHead className="font-semibold text-gray-700 dark:text-gray-200 h-12">
                    Cliente
                  </TableHead>
                  <TableHead className="font-semibold text-gray-700 dark:text-gray-200 h-12">
                    Total
                  </TableHead>
                  <TableHead className="font-semibold text-gray-700 dark:text-gray-200 h-12">
                    Fecha
                  </TableHead>
                  <TableHead className="font-semibold text-gray-700 dark:text-gray-200 h-12">
                    Estado
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedOrders.map((order) => (
                  <TableRow
                    key={order.id}
                    className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors cursor-pointer"
                    onClick={() =>
                      router.push(`/account-ledger/${order.id}`)
                    }
                  >
                    <TableCell className="font-medium py-3">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="truncate max-w-[200px]">
                          {order.client?.name || "Sin cliente"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono font-medium">
                        ${order.total.toLocaleString("es-AR")}
                      </span>
                    </TableCell>
                    <TableCell>
                      <LocalDate date={order.date} />
                    </TableCell>
                    <TableCell>
                      <StatusPill
                        status={order.status}
                        paidStatus={order.paidStatus}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {filteredOrders.length} resultado
                  {filteredOrders.length !== 1 ? "s" : ""}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-gray-500 dark:text-gray-400 px-2 min-w-[60px] text-center">
                    {page} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
