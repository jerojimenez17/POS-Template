"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ClientListItem } from "@/actions/clients";
import { createClient, deleteClient, updateClient } from "@/actions/clients";
import ClientForm from "@/components/clients/ClientForm";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/clients/ClientsLoading";
import { LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react";

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
  const [notice, setNotice] = useState(initialError);
  const [noticeIsError, setNoticeIsError] = useState(Boolean(initialError));
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
        setNotice(undefined); setNoticeIsError(false);
      }).catch(() => { if (id === requestId.current) { setNotice("No se pudieron cargar los clientes"); setNoticeIsError(true); } });
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
      if (!result.success) { setNotice(result.error ?? "No se pudo guardar el cliente"); setNoticeIsError(true); return; }
      const saved = result.client ?? result.data;
      const refreshed = await reconcileFirstPage();
      if (!serverPaging && saved) {
        setClients((current) => {
          const next = editing ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved];
          return next.sort((a, b) => a.name.localeCompare(b.name, "es") || a.id.localeCompare(b.id));
        });
      }
      setNotice(refreshed ? "Cliente guardado correctamente" : "Cliente guardado, pero no se pudo actualizar la lista");
      setNoticeIsError(!refreshed);
      setFormOpen(false); setEditing(undefined);
    } catch (error) { console.error("Error guardando cliente", error); setNotice("No se pudo guardar el cliente"); setNoticeIsError(true); }
    finally { setMutating(false); }
  };

  const remove = async (): Promise<void> => {
    if (!pendingDelete) return;
    setMutating(true);
    try {
      const result = await deleteClient({ id: pendingDelete.id });
      if (!result.success) { setNotice(result.error ?? "No se pudo eliminar el cliente"); setNoticeIsError(true); return; }
      const refreshed = await reconcileFirstPage();
      if (!serverPaging) setClients((current) => current.filter((item) => item.id !== pendingDelete.id));
      setNotice(refreshed ? "Cliente eliminado correctamente" : "Cliente eliminado, pero no se pudo actualizar la lista");
      setNoticeIsError(!refreshed); setPendingDelete(undefined);
    } catch (error) { console.error("Error eliminando cliente", error); setNotice("No se pudo eliminar el cliente"); setNoticeIsError(true); }
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
      if (generation === requestId.current) {
        setNotice(undefined);
        setNoticeIsError(false);
      }
    } catch { if (generation === requestId.current) { setNotice("No se pudieron cargar más clientes"); setNoticeIsError(true); setLoadingMoreError(true); } }
    finally { if (generation === requestId.current) setLoadingMore(false); }
  };
  const openCreate = () => { setEditing(undefined); setFormOpen(true); };
  const openEdit = (client: ClientListItem) => { setEditing(client); setFormOpen(true); };

  if (isLoading) return <main className="container mx-auto max-w-6xl px-4 py-8" aria-busy="true"><Skeleton /></main>;
  if (initialError && clients.length === 0) return <main className="container mx-auto max-w-6xl px-4 py-8"><div role="alert" className="rounded-xl border border-destructive/40 p-8 text-center"><p>{initialError}</p><Button className="mt-4" onClick={() => window.location.reload()}>Reintentar</Button></div></main>;

  const card = (client: ClientListItem) => <Card key={client.id} className="md:hidden"><CardHeader className="flex-row items-start justify-between gap-3 p-4"><div className="min-w-0"><h2 className="break-words font-semibold">{client.name}</h2><p className="truncate text-sm text-muted-foreground">{display(client.cellPhone)} · {display(client.email)}</p></div><div className="flex shrink-0 gap-2"><Button variant="outline" size="icon" aria-label={`Editar cliente ${client.name}`} disabled={mutating} onClick={() => openEdit(client)}><Pencil /></Button><Button variant="outline" size="icon" aria-label={`Eliminar cliente ${client.name}`} disabled={mutating} onClick={() => setPendingDelete(client)}><Trash2 /></Button></div></CardHeader><CardContent className="grid grid-cols-2 gap-2 p-4 pt-0 text-sm"><span>Dirección: {display(client.address)}</span><span>Saldo: {money(client.balance)}</span><span>CUIT: {display(client.cuit)}</span><span>IVA: {display(client.ivaCondition)}</span></CardContent></Card>;

  return <main className="container mx-auto max-w-6xl px-4 py-8">
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-bold">Clientes</h1><p className="mt-1 text-muted-foreground">Gestiona tus clientes y su información de contacto.</p><p className="mt-2 text-sm" role="status">{visible.length} clientes cargados</p></div><Button onClick={openCreate} disabled={mutating}><Plus /> Nuevo cliente</Button></header>
     <div className="mb-5"><label htmlFor="client-search" className="mb-2 block text-sm font-medium">Buscar clientes</label><Input id="client-search" type="search" role="searchbox" placeholder="Nombre, teléfono, email o CUIT..." value={query} onChange={(event) => updateQuery(event.target.value)} /></div>
     {notice && <p role={noticeIsError ? "alert" : "status"} className="mb-4 text-sm">{notice}</p>}
    {formOpen && <Card className="mb-6"><CardHeader><h2 className="text-lg font-semibold">{editing ? "Editar cliente" : "Nuevo cliente"}</h2></CardHeader><CardContent><ClientForm client={editing} onSubmit={save} onCancel={() => { setFormOpen(false); setEditing(undefined); }} busy={mutating} /></CardContent></Card>}
     {visible.length === 0 ? <div className="rounded-xl border border-dashed p-10 text-center"><p className="mb-4 text-muted-foreground">{query.trim() ? "No se encontraron coincidencias" : "No hay clientes todavía"}</p><Button onClick={query.trim() ? () => updateQuery("") : openCreate}>{query.trim() ? "Limpiar búsqueda" : "Crear cliente"}</Button></div> : <><div className="grid gap-3 md:hidden">{visible.map(card)}</div><div className="hidden overflow-hidden rounded-xl border md:block"><table className="w-full text-sm"><thead><tr className="border-b bg-muted/40 text-left"><th scope="col" className="p-3">Nombre</th><th scope="col" className="p-3">Teléfono</th><th scope="col" className="p-3">Dirección</th><th scope="col" className="p-3">CUIT</th><th scope="col" className="p-3">Condición IVA</th><th scope="col" className="p-3">Email</th><th scope="col" className="p-3">Saldo</th><th scope="col" className="p-3">Acciones</th></tr></thead><tbody>{visible.map((client) => <tr key={client.id} className="border-b last:border-0 hover:bg-muted/30"><td className="p-3 font-medium">{client.name}</td><td className="p-3">{display(client.cellPhone)}</td><td className="p-3">{display(client.address)}</td><td className="p-3">{display(client.cuit)}</td><td className="p-3">{client.ivaCondition ? <Badge variant="secondary">{client.ivaCondition}</Badge> : "—"}</td><td className="break-all p-3">{display(client.email)}</td><td className="p-3">{money(client.balance)}</td><td className="p-3"><div className="flex gap-2"><Button variant="outline" size="icon" aria-label={`Editar ${client.name}`} disabled={mutating} onClick={() => openEdit(client)}><Pencil /></Button><Button variant="outline" size="icon" aria-label={`Eliminar ${client.name}`} disabled={mutating} onClick={() => setPendingDelete(client)}><Trash2 /></Button></div></td></tr>)}</tbody></table></div></>}
      {more && (onLoadMore || serverPaging) && <div className="mt-6 text-center"><Button variant="outline" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}{loadingMore ? "Cargando..." : loadingMoreError ? "Reintentar" : "Cargar más"}</Button>{loadingMore && <span role="status" className="sr-only">Cargando más clientes</span>}</div>}
    <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => { if (!open && !mutating) setPendingDelete(undefined); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>¿Eliminar cliente?</AlertDialogTitle><AlertDialogDescription>Se eliminará <strong>{pendingDelete?.name}</strong>. Esta acción no se puede deshacer y se bloqueará si tiene órdenes históricas.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={mutating}>Cancelar</AlertDialogCancel><AlertDialogAction disabled={mutating} onClick={(event) => { event.preventDefault(); void remove(); }}>{mutating ? "Eliminando..." : "Eliminar"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </main>;
}
