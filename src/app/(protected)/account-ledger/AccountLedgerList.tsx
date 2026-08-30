"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Calendar, CreditCard, DollarSign, Eye, Printer, User, XCircle } from "lucide-react";
import { getUnpaidOrders, type AccountLedgerOrder, type AccountLedgerPage } from "@/actions/unpaid-orders";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LocalDate } from "@/components/ui/LocalDate";
import { OverdueIndicator } from "@/components/ui/OverdueIndicator";
import { isOrderOverdue } from "@/utils/overdue";
import ConfirmOrderButton from "./ConfirmOrderButton";

interface Props {
  status: string;
  search?: string;
  initialPage: AccountLedgerPage;
}

const isPage = (value: unknown): value is AccountLedgerPage => {
  if (typeof value !== "object" || value === null) return false;
  const page = value as Partial<AccountLedgerPage>;
  return Array.isArray(page.orders) && (typeof page.nextCursor === "string" || page.nextCursor === null);
};

export default function AccountLedgerList({ status, search = "", initialPage }: Props) {
  const infinite = status === "pago" || status === "all";
  const [page, setPage] = useState<AccountLedgerPage>(initialPage);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageCursors, setPageCursors] = useState<Array<string | null>>([null]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const generationRef = useRef(0);
  const queryKeyRef = useRef(`${status}\u0000${search}`);
  const failedRequestRef = useRef<{ cursor: string | null; append: boolean } | null>(null);

  useEffect(() => {
    // Pusher/router.refresh and URL changes provide a new first-page snapshot.
    generationRef.current += 1;
    queryKeyRef.current = `${status}\u0000${search}`;
    loadingRef.current = false;
    failedRequestRef.current = null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingMore(false);
    setPage(initialPage);
    setCurrentPage(1);
    setPageCursors([null]);
    setError(null);
  }, [initialPage, status, search]);

  const load = useCallback(async (cursor: string | null, append: boolean) => {
    if (loadingRef.current) return;
    const generation = generationRef.current;
    const queryKey = queryKeyRef.current;
    loadingRef.current = true;
    setLoadingMore(true);
    setError(null);
    try {
      const result = await getUnpaidOrders({
        businessId: "",
        status,
        search,
        limit: infinite ? 50 : 100,
        cursor,
      });
      if (generation !== generationRef.current || queryKey !== queryKeyRef.current) return;
      if (!result.success || !isPage(result.data)) {
        throw new Error(result.error || "No se pudieron cargar las órdenes");
      }
      const pageData = result.data;
      if (append) {
        setPage((previous) => ({
          ...pageData,
          orders: [...previous.orders, ...pageData.orders],
        }));
      } else {
        // Fixed tabs replace the visible batch: setPage(result.data)
        setPage(result.data);
      }
      failedRequestRef.current = null;
    } catch (cause) {
      if (generation !== generationRef.current || queryKey !== queryKeyRef.current) return;
      console.error("Error loading account ledger page:", cause);
      failedRequestRef.current = { cursor, append };
      setError(append ? "No se pudieron cargar más órdenes" : "No se pudieron cargar las órdenes");
    } finally {
      if (generation === generationRef.current && queryKey === queryKeyRef.current) {
        loadingRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [infinite, search, status]);

  const loadMore = useCallback(() => {
    if (!infinite || !page.nextCursor || loadingMore) return;
    void load(page.nextCursor, true);
  }, [infinite, load, loadingMore, page.nextCursor]);

  useEffect(() => {
    if (!infinite || !sentinelRef.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) loadMore();
    }, { rootMargin: "240px" });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [infinite, loadMore]);

  const next = () => {
    if (infinite || !page.nextCursor || loadingMore) return;
    const nextPage = currentPage + 1;
    setPageCursors((previous) => [...previous.slice(0, nextPage - 1), page.nextCursor]);
    setCurrentPage(nextPage);
    void load(page.nextCursor, false);
  };

  const previous = () => {
    if (currentPage === 1 || loadingMore) return;
    const previousPage = currentPage - 1;
    setCurrentPage(previousPage);
    void load(pageCursors[previousPage - 1] ?? null, false);
  };

  const getStatusBadge = (order: AccountLedgerOrder) => {
    if (order.status === "pendiente") return <Badge variant="secondary" className="bg-orange-100 text-orange-800">Por Confirmar</Badge>;
    if (order.paidStatus === "inpago") return <Badge variant="destructive">Pendiente Pago</Badge>;
    if (order.paidStatus === "pago") return <Badge className="bg-green-500">Pagado</Badge>;
    return <Badge variant="outline">{order.paidStatus}</Badge>;
  };

  return (
    <div className="space-y-4">
      {page.orders.length === 0 && !loadingMore ? (
        <div className="py-8 text-center text-muted-foreground">No se encontraron órdenes</div>
      ) : (
        <Table>
          <TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Total</TableHead><TableHead>Fecha</TableHead><TableHead>Estado</TableHead><TableHead className="text-right">Acciones</TableHead></TableRow></TableHeader>
          <TableBody>{page.orders.map((order) => (
            <TableRow key={order.id}>
              <TableCell className="font-medium"><div className="flex items-center gap-2"><User className="h-4 w-4 shrink-0 text-muted-foreground" /><div className="min-w-0"><div className="flex items-center gap-1">{isOrderOverdue(order) && <OverdueIndicator />}<span className="truncate">{order.client?.name || "Sin cliente"}</span></div>{order.notes && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground" title={order.notes}>{order.notes}</p>}</div></div></TableCell>
              <TableCell><div className="flex items-center gap-1"><DollarSign className="h-4 w-4 text-muted-foreground" />${order.total.toLocaleString("es-AR")}</div></TableCell>
              <TableCell><div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-muted-foreground" /><LocalDate date={order.date} /></div></TableCell>
              <TableCell>{getStatusBadge(order)}</TableCell>
              <TableCell className="text-right"><div className="flex justify-end gap-2"><Button variant="outline" size="sm" asChild><Link href={`/account-ledger/${order.id}`}><Eye className="mr-1 h-4 w-4" />Ver</Link></Button><Button variant="ghost" size="sm" asChild title="Imprimir"><Link href={`/account-ledger/${order.id}`}><Printer className="h-4 w-4" /></Link></Button>{order.status === "pendiente" ? <ConfirmOrderButton orderId={order.id} /> : order.paidStatus !== "pago" ? <><Button size="sm" asChild><Link href={`/account-ledger/${order.id}?action=payment`}><CreditCard className="mr-1 h-4 w-4" />Pagar</Link></Button><Button variant="destructive" size="sm" asChild><Link href={`/account-ledger/${order.id}?action=cancel`}><XCircle className="mr-1 h-4 w-4" />Cancelar</Link></Button></> : null}</div></TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
      )}
      {error && <div className="flex items-center justify-center gap-3 text-sm text-red-500">{error}<Button variant="outline" size="sm" onClick={() => {
        const failed = failedRequestRef.current;
        if (failed) void load(failed.cursor, failed.append);
      }}>Reintentar</Button></div>}
      {infinite ? <div ref={sentinelRef} aria-label="Cargar más órdenes" className="flex min-h-10 items-center justify-center text-sm text-muted-foreground">{loadingMore ? "Cargando más…" : page.hasMore ? "" : null}</div> : <div className="flex items-center justify-center gap-4"><Button variant="outline" onClick={previous} disabled={currentPage === 1 || loadingMore}>Anterior</Button><span className="text-sm">Página {currentPage}</span><Button variant="outline" onClick={next} disabled={!page.hasMore || loadingMore}>Siguiente</Button></div>}
    </div>
  );
}
