"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { getUnpaidOrders, type AccountLedgerOrder, type AccountLedgerPage } from "@/actions/unpaid-orders";
import { getBusinessBillingInfoAction } from "@/actions/business";
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
import PrintRowButton from "./PrintRowButton";
import ConfirmOrderButton from "./ConfirmOrderButton";

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
// Paid orders are the unbounded, ever-growing set, so that tab uses cursor
// continuation (append). "pendiente"/"inpago" are operational queues served as
// fixed-size windows navigated with a cursor stack (upstream #111/#116 model).
const INFINITE_TABS: StatusFilter[] = ["pago"];
const INFINITE_LIMIT = 50;

const TABS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "pendiente", label: "Por Confirmar" },
  { value: "inpago", label: "Pendientes" },
  { value: "pago", label: "Pagados" },
];

const isPage = (value: unknown): value is AccountLedgerPage => {
  if (typeof value !== "object" || value === null) return false;
  const page = value as Partial<AccountLedgerPage>;
  return Array.isArray(page.orders) && (typeof page.nextCursor === "string" || page.nextCursor === null);
};

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
  const [billingInfo, setBillingInfo] = useState<Record<string, unknown> | null>(null);

  // Server-side paginated state for status tabs (upstream #111/#116 data flow,
  // rendered with our existing visual language).
  const [pageData, setPageData] = useState<AccountLedgerPage | null>(null);
  const [serverLoading, setServerLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageCursors, setPageCursors] = useState<Array<string | null>>([null]);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const generationRef = useRef(0);
  const queryKeyRef = useRef(`${activeTab}\u0000${debouncedSearch}`);
  const failedRequestRef = useRef<{ cursor: string | null; append: boolean } | null>(null);

  const isAllTab = activeTab === "all";
  const isInfinite = INFINITE_TABS.includes(activeTab);

  // Fetch billing info once
  useEffect(() => {
    getBusinessBillingInfoAction().then(setBillingInfo);
  }, []);

  // "Todos" tab keeps the legacy unfiltered contract (raw array, includes
  // "pendiente" orders) and our client-side filtering/sorting/pagination.
  useEffect(() => {
    if (!isAllTab) return;
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
  }, [businessId, refreshToggle, isAllTab]);

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
      pusherClient.unsubscribe(channelName);
    };
  }, [businessId]);

  // Optimistic UI update when an order is confirmed (applies to both data paths)
  const handleOrderConfirmed = useCallback((orderId: string) => {
    setAllOrders((prev) =>
      prev.map((o) =>
        o.id === orderId ? { ...o, status: "confirmado" } : o
      )
    );
    setPageData((prev) =>
      prev
        ? {
            ...prev,
            orders: prev.orders.map((o) =>
              o.id === orderId ? { ...o, status: "confirmado" } : o
            ),
          }
        : prev
    );
  }, []);

  // Debounce search + reset page
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async (cursor: string | null, append: boolean) => {
    if (loadingRef.current) return;
    const generation = generationRef.current;
    const queryKey = queryKeyRef.current;
    loadingRef.current = true;
    setServerLoading(true);
    setServerError(null);
    try {
      const result = await getUnpaidOrders({
        businessId,
        status: activeTab,
        search: debouncedSearch,
        limit: isInfinite ? INFINITE_LIMIT : undefined,
        cursor,
      });
      if (generation !== generationRef.current || queryKey !== queryKeyRef.current) return;
      if (!result.success || !isPage(result.data)) {
        throw new Error(result.error || "No se pudieron cargar las órdenes");
      }
      const pageResult = result.data;
      if (append) {
        setPageData((previous) => ({
          ...pageResult,
          orders: [...(previous?.orders ?? []), ...pageResult.orders],
        }));
      } else {
        setPageData(pageResult);
      }
      failedRequestRef.current = null;
    } catch (cause) {
      if (generation !== generationRef.current || queryKey !== queryKeyRef.current) return;
      console.error("Error loading account ledger page:", cause);
      failedRequestRef.current = { cursor, append };
      setServerError(append ? "No se pudieron cargar más órdenes" : "No se pudieron cargar las órdenes");
    } finally {
      if (generation === generationRef.current && queryKey === queryKeyRef.current) {
        loadingRef.current = false;
        setServerLoading(false);
      }
    }
  }, [activeTab, businessId, debouncedSearch, isInfinite]);

  // Tab/search/realtime changes provide a new first-page snapshot.
  useEffect(() => {
    if (isAllTab) return;
    generationRef.current += 1;
    queryKeyRef.current = `${activeTab}\u0000${debouncedSearch}`;
    loadingRef.current = false;
    failedRequestRef.current = null;
    // Snapshot reset for a new query key — same sanctioned pattern as
    // AccountLedgerList.tsx (server cursor pagination orchestration).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setServerLoading(false);
    setPageData(null);
    setCurrentPage(1);
    setPageCursors([null]);
    setServerError(null);
    void load(null, false);
  }, [activeTab, debouncedSearch, refreshToggle, isAllTab, load]);

  const loadMore = useCallback(() => {
    if (!isInfinite || !pageData?.nextCursor || serverLoading) return;
    void load(pageData.nextCursor, true);
  }, [isInfinite, load, pageData, serverLoading]);

  useEffect(() => {
    if (!isInfinite || !sentinelRef.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) loadMore();
    }, { rootMargin: "240px" });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [isInfinite, loadMore]);

  const goNextWindow = () => {
    if (isInfinite || !pageData?.nextCursor || serverLoading) return;
    const nextWindow = currentPage + 1;
    setPageCursors((previous) => [...previous.slice(0, nextWindow - 1), pageData.nextCursor]);
    setCurrentPage(nextWindow);
    void load(pageData.nextCursor, false);
  };

  const goPrevWindow = () => {
    if (currentPage === 1 || serverLoading) return;
    const prevWindow = currentPage - 1;
    setCurrentPage(prevWindow);
    void load(pageCursors[prevWindow - 1] ?? null, false);
  };

  // Filter by tab + search + sort (only for the legacy "Todos" path)
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

  // Paginate (legacy "Todos" path only)
  const totalPages = Math.ceil(filteredOrders.length / ITEMS_PER_PAGE);
  const paginatedAllOrders = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return filteredOrders.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredOrders, page]);

  const rows: (OrderWithClient | AccountLedgerOrder)[] = isAllTab
    ? paginatedAllOrders
    : pageData?.orders ?? [];

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
        {isAllTab && loading ? (
          <div className="flex items-center justify-center py-12 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !isAllTab && pageData === null && serverLoading && !serverError ? (
          <div className="flex items-center justify-center py-12 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : serverError && rows.length === 0 ? (
          <div className="flex items-center justify-center gap-3 py-12 text-sm text-red-500 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700">
            {serverError}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const failed = failedRequestRef.current;
                if (failed) void load(failed.cursor, failed.append);
              }}
            >
              Reintentar
            </Button>
          </div>
        ) : rows.length === 0 && !serverLoading ? (
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
                  <TableHead className="font-semibold text-gray-700 dark:text-gray-200 h-12 text-right">
                    Acciones
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((order) => (
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
                    <TableCell className="text-right">
                      <div
                        className="flex items-center justify-end gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {order.status === "pendiente" && (
                          <ConfirmOrderButton
                            orderId={order.id}
                            onConfirmed={handleOrderConfirmed}
                          />
                        )}
                        <PrintRowButton
                          orderId={order.id}
                          billingInfo={billingInfo}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Infinite-scroll sentinel (Pagados) */}
            {isInfinite && (
              <div
                ref={sentinelRef}
                aria-label="Cargar más órdenes"
                className="flex min-h-10 items-center justify-center gap-2 border-t border-gray-200 dark:border-gray-700 py-3 text-sm text-gray-500 dark:text-gray-400"
              >
                {serverError ? (
                  <>
                    <span className="text-red-500">{serverError}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const failed = failedRequestRef.current;
                        if (failed) void load(failed.cursor, failed.append);
                      }}
                    >
                      Reintentar
                    </Button>
                  </>
                ) : serverLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Cargando más…
                  </>
                ) : null}
              </div>
            )}

            {/* Pagination */}
            {isAllTab && totalPages > 1 && (
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

            {/* Fixed-window navigation (Por Confirmar / Pendientes) */}
            {!isAllTab && !isInfinite && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {rows.length} en esta página
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={currentPage <= 1 || serverLoading}
                    onClick={goPrevWindow}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-gray-500 dark:text-gray-400 px-2 min-w-[60px] text-center">
                    Página {currentPage}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={!pageData?.hasMore || serverLoading}
                    onClick={goNextWindow}
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
