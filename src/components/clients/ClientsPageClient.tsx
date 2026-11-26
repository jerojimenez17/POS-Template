"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { ClientListItem } from "@/actions/clients";
import { createClient, deleteClient, updateClient } from "@/actions/clients";
import ClientForm from "@/components/clients/ClientForm";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/clients/ClientsLoading";
import { ArrowLeft, LoaderCircle, Pencil, Plus, Search, Trash2, Users, X } from "lucide-react";
import { toast } from "sonner";

interface Props {
  clients: ClientListItem[];
  initialError?: string;
  isLoading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => Promise<void>;
  nextCursor?: string | null;
}

function display(value: string | null): string { return value ?? "—"; }
function money(value: number): string { return `$${value.toLocaleString("es-AR")}`; }

export default function ClientsPageClient({ clients: initialClients, initialError, isLoading, hasMore: initialHasMore = false, onLoadMore, nextCursor: initialCursor }: Props) {
  const [clients, setClients] = useState(initialClients);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<ClientListItem>();
  const [formOpen, setFormOpen] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingMoreError, setLoadingMoreError] = useState(false);
  const [more, setMore] = useState(initialHasMore);
  const [cursor, setCursor] = useState(initialCursor ?? null);
  const requestId = useRef(0);
  const [pendingDelete, setPendingDelete] = useState<ClientListItem>();
  const serverPaging = initialCursor !== undefined;

  const resetSearchResults = (): void => {
    // Invalidate pending page loads before clearing server-side results.
    ++requestId.current;
    if (!serverPaging) return;
    setClients([]);
    setCursor(null);
    setMore(false);
    setLoadingMore(false);
  };

  const updateQuery = (nextQuery: string): void => {
    resetSearchResults();
    setQuery(nextQuery);
  };

  useEffect(() => {
    if (!serverPaging) return;
    const id = ++requestId.current;
    const timer = window.setTimeout(() => {
      void import("@/actions/clients").then(({ getClientsPage }) => getClientsPage({ search: query, limit: 25 })).then((result) => {
        if (id !== requestId.current || !result.success || !result.data) return;
        setClients(result.data.clients); setCursor(result.data.nextCursor); setMore(result.data.hasMore);
      }).catch(() => { if (id === requestId.current) { toast.error("No se pudieron cargar los clientes"); } });
    }, query ? 250 : 0);
    return () => { window.clearTimeout(timer); };
  }, [query, serverPaging]);

  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!term) return clients;
    return clients.filter((client) => [client.name, client.cellPhone, client.email, client.cuit]
      .some((value) => value?.toLocaleLowerCase().includes(term)));
  }, [clients, query]);

  const reconcileFirstPage = async (): Promise<boolean> => {
    const id = ++requestId.current;
    if (!serverPaging) return true;
    try {
      const { getClientsPage } = await import("@/actions/clients");
      const result = await getClientsPage({ search: query, limit: 25 });
      if (id !== requestId.current || !result.success || !result.data) return false;
      setClients(result.data.clients);
      setCursor(result.data.nextCursor);
      setMore(result.data.hasMore);
      return true;
    } catch {
      return false;
    }
  };

  const save = async (value: Record<string, string>): Promise<void> => {
    setMutating(true);
    try {
      const result = editing ? await updateClient({ ...value, id: editing.id }) : await createClient(value);
      if (!result.success) { toast.error(result.error ?? "No se pudo guardar el cliente"); return; }
      const saved = result.client ?? result.data;
      const refreshed = await reconcileFirstPage();
      if (!serverPaging && saved) {
        setClients((current) => {
          const next = editing ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved];
          return next.sort((a, b) => a.name.localeCompare(b.name, "es") || a.id.localeCompare(b.id));
        });
      }
      if (refreshed) toast.success(editing ? "Cliente actualizado correctamente" : "Cliente creado correctamente");
      else toast.error("Cliente guardado, pero no se pudo actualizar la lista");
      setFormOpen(false); setEditing(undefined);
    } catch (error) { console.error("Error guardando cliente", error); toast.error("No se pudo guardar el cliente"); }
    finally { setMutating(false); }
  };

  const remove = async (): Promise<void> => {
    if (!pendingDelete) return;
    setMutating(true);
    try {
      const result = await deleteClient({ id: pendingDelete.id });
      if (!result.success) { toast.error(result.error ?? "No se pudo eliminar el cliente"); return; }
      const refreshed = await reconcileFirstPage();
      if (!serverPaging) setClients((current) => current.filter((item) => item.id !== pendingDelete.id));
      if (refreshed) toast.success("Cliente eliminado correctamente");
      else toast.error("Cliente eliminado, pero no se pudo actualizar la lista");
      setPendingDelete(undefined);
    } catch (error) { console.error("Error eliminando cliente", error); toast.error("No se pudo eliminar el cliente"); }
    finally { setMutating(false); }
  };

  const loadMore = async (): Promise<void> => {
    if (loadingMore) return;
    const generation = requestId.current;
    setLoadingMore(true);
    setLoadingMoreError(false);
    try {
      if (onLoadMore) await onLoadMore();
      else if (serverPaging && cursor) {
        const { getClientsPage } = await import("@/actions/clients");
        const result = await getClientsPage({ search: query, cursor, limit: 25 });
        if (!result.success || !result.data) throw new Error("load failed");
        if (generation !== requestId.current) return;
        setClients((current) => [...current, ...result.data!.clients.filter((item) => !current.some((old) => old.id === item.id))]);
        setCursor(result.data.nextCursor); setMore(result.data.hasMore);
      }
    } catch { if (generation === requestId.current) { toast.error("No se pudieron cargar más clientes"); setLoadingMoreError(true); } }
    finally { if (generation === requestId.current) setLoadingMore(false); }
  };
  const openCreate = () => { setEditing(undefined); setFormOpen(true); };
  const openEdit = (client: ClientListItem) => { setEditing(client); setFormOpen(true); };

  if (isLoading) return <div className="min-h-screen bg-slate-50 dark:bg-gray-900" aria-busy="true"><main className="mx-auto max-w-7xl px-4 py-8"><Skeleton /></main></div>;
  if (initialError && clients.length === 0) return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-900">
      <main className="mx-auto max-w-7xl px-4 py-8">
        <div role="alert" className="rounded-xl border border-destructive/40 bg-card p-8 text-center">
          <p className="text-destructive">{initialError}</p>
          <Button className="mt-4" onClick={() => window.location.reload()}>Reintentar</Button>
        </div>
      </main>
    </div>
  );

  const card = (client: ClientListItem) => (
    <Card key={client.id} className="md:hidden">
      <CardHeader className="flex-row items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <h2 className="break-words font-semibold">{client.name}</h2>
          <p className="truncate text-sm text-muted-foreground">{display(client.cellPhone)} · {display(client.email)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="icon" aria-label={`Editar cliente ${client.name}`} disabled={mutating} onClick={() => openEdit(client)} className="h-8 w-8 text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label={`Eliminar cliente ${client.name}`} disabled={mutating} onClick={() => setPendingDelete(client)} className="h-8 w-8 text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-2 p-4 pt-0 text-sm">
        <span>Dirección: {display(client.address)}</span>
        <span>Saldo: {money(client.balance)}</span>
        <span>CUIT: {display(client.cuit)}</span>
        <span>IVA: {display(client.ivaCondition)}</span>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-900 pb-20">
      <header className="p-4 md:p-6 border-b bg-white dark:bg-gray-900 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild title="Volver">
            <Link href="/"><ArrowLeft className="h-5 w-5" /></Link>
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <Users className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight">Clientes</h1>
              <p className="text-sm text-gray-500 hidden sm:block">Gestioná tus clientes y su información de contacto</p>
            </div>
          </div>
        </div>
        <Button onClick={openCreate} disabled={mutating}>
          <Plus className="h-4 w-4" /> Nuevo cliente
        </Button>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
              <Input
                id="client-search"
                type="search"
                role="searchbox"
                aria-label="Buscar clientes"
                placeholder="Nombre, teléfono, email o CUIT..."
                value={query}
                onChange={(event) => updateQuery(event.target.value)}
                className="h-10 w-full rounded-lg border-gray-200 bg-gray-50 pl-10 pr-10 text-sm transition-all focus:ring-2 focus:ring-black dark:border-gray-700 dark:bg-gray-800 dark:focus:ring-white"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => updateQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-sm text-gray-400 transition-colors hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:text-gray-200"
                  title="Borrar búsqueda"
                  aria-label="Borrar búsqueda"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400" role="status">{visible.length} clientes cargados</p>
          </div>

          {visible.length === 0 ? (
            <div className="p-10 text-center">
              <p className="mb-4 text-muted-foreground">{query.trim() ? "No se encontraron coincidencias" : "No hay clientes todavía"}</p>
              <Button onClick={query.trim() ? () => updateQuery("") : openCreate}>{query.trim() ? "Limpiar búsqueda" : "Crear cliente"}</Button>
            </div>
          ) : (
            <>
              <div className="grid gap-3 p-3 md:hidden">{visible.map(card)}</div>
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50">
                      <TableHead scope="col">Nombre</TableHead>
                      <TableHead scope="col">Teléfono</TableHead>
                      <TableHead scope="col">Dirección</TableHead>
                      <TableHead scope="col">CUIT</TableHead>
                      <TableHead scope="col">Condición IVA</TableHead>
                      <TableHead scope="col">Email</TableHead>
                      <TableHead scope="col">Saldo</TableHead>
                      <TableHead scope="col" className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.map((client) => (
                      <TableRow key={client.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/30">
                        <TableCell className="font-medium">{client.name}</TableCell>
                        <TableCell>{display(client.cellPhone)}</TableCell>
                        <TableCell>{display(client.address)}</TableCell>
                        <TableCell>{display(client.cuit)}</TableCell>
                        <TableCell>{client.ivaCondition ? <Badge variant="secondary">{client.ivaCondition}</Badge> : "—"}</TableCell>
                        <TableCell className="break-all">{display(client.email)}</TableCell>
                        <TableCell>{money(client.balance)}</TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" aria-label={`Editar ${client.name}`} disabled={mutating} onClick={() => openEdit(client)} className="h-8 w-8 text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" aria-label={`Eliminar ${client.name}`} disabled={mutating} onClick={() => setPendingDelete(client)} className="h-8 w-8 text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}

          {more && (onLoadMore || serverPaging) && (
            <div className="border-t border-gray-100 p-4 text-center dark:border-gray-700">
              <Button variant="outline" onClick={() => void loadMore()} disabled={loadingMore}>
                {loadingMore && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
                {loadingMore ? "Cargando..." : loadingMoreError ? "Reintentar" : "Cargar más"}
              </Button>
              {loadingMore && <span role="status" className="sr-only">Cargando más clientes</span>}
            </div>
          )}
        </div>
      </div>

      <Dialog open={formOpen} onOpenChange={(open) => { setFormOpen(open); if (!open) setEditing(undefined); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
          </DialogHeader>
          <ClientForm client={editing} onSubmit={save} onCancel={() => { setFormOpen(false); setEditing(undefined); }} busy={mutating} />
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => { if (!open && !mutating) setPendingDelete(undefined); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar cliente?</AlertDialogTitle>
            <AlertDialogDescription>Se eliminará <strong>{pendingDelete?.name}</strong>. Esta acción no se puede deshacer y se bloqueará si tiene órdenes históricas.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutating}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={mutating} onClick={(event) => { event.preventDefault(); void remove(); }} className="bg-red-600 text-white hover:bg-red-700 focus:ring-red-600">{mutating ? "Eliminando..." : "Eliminar"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
