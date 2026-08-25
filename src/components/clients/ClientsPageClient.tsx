"use client";

import { useMemo, useState } from "react";
import type { ClientListItem } from "@/actions/clients";
import ClientForm from "@/components/clients/ClientForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Plus, Trash2 } from "lucide-react";

interface Props {
  clients: ClientListItem[];
  initialError?: string;
}

function display(value: string | null): string {
  return value ?? "—";
}

export default function ClientsPageClient({ clients: initialClients, initialError }: Props) {
  const [clients, setClients] = useState<ClientListItem[]>(initialClients);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<ClientListItem>();
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(initialError);

  const visible = useMemo(() => {
    const term = query.toLowerCase().trim();
    return clients.filter((client) =>
      !term || [client.name, client.cellPhone, client.email, client.cuit]
        .some((value) => value?.toLowerCase().includes(term))
    );
  }, [clients, query]);

  const save = async (value: Record<string, string>): Promise<void> => {
    setBusy(true);
    try {
      const { createClient, updateClient } = await import("@/actions/clients");
      const result = editing
        ? await updateClient({ ...value, id: editing.id })
        : await createClient(value);
      if (!result.success) {
        setNotice(result.error ?? "No se pudo guardar el cliente");
        return;
      }
      const saved = result.client ?? result.data;
      if (saved) {
        setClients((current) => editing
          ? current.map((item) => item.id === saved.id ? saved : item)
          : [...current, saved].sort((a, b) => a.name.localeCompare(b.name)));
      }
      setNotice("Cliente guardado correctamente");
      setFormOpen(false);
      setEditing(undefined);
    } catch (error) {
      console.error("Error guardando cliente", error);
      setNotice("No se pudo guardar el cliente");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (client: ClientListItem): Promise<void> => {
    if (!window.confirm(`¿Eliminar al cliente ${client.name}?`)) return;
    setBusy(true);
    try {
      const { deleteClient } = await import("@/actions/clients");
      const result = await deleteClient({ id: client.id });
      if (!result.success) {
        setNotice(result.error ?? "No se pudo eliminar el cliente");
        return;
      }
      setClients((current) => current.filter((item) => item.id !== client.id));
      setNotice("Cliente eliminado correctamente");
    } catch (error) {
      console.error("Error eliminando cliente", error);
      setNotice("No se pudo eliminar el cliente");
    } finally {
      setBusy(false);
    }
  };

  const openCreate = () => {
    setEditing(undefined);
    setFormOpen(true);
  };

  const clientCard = (client: ClientListItem) => (
    <article key={client.id} className="rounded-lg border p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <h2 className="font-semibold break-words">{client.name}</h2>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="icon" aria-label={`Editar ${client.name}`} disabled={busy}
            onClick={() => { setEditing(client); setFormOpen(true); }}><Pencil /></Button>
          <Button variant="outline" size="icon" aria-label={`Eliminar ${client.name}`} disabled={busy}
            onClick={() => void remove(client)}><Trash2 /></Button>
        </div>
      </div>
      <dl className="grid gap-1 text-sm sm:grid-cols-2">
        <div><dt className="font-medium">Teléfono</dt><dd>{display(client.cellPhone)}</dd></div>
        <div><dt className="font-medium">Dirección</dt><dd>{display(client.address)}</dd></div>
        <div><dt className="font-medium">CUIT</dt><dd>{display(client.cuit)}</dd></div>
        <div><dt className="font-medium">Condición IVA</dt><dd>{display(client.ivaCondition)}</dd></div>
        <div className="break-all"><dt className="font-medium">Email</dt><dd>{display(client.email)}</dd></div>
        <div><dt className="font-medium">Saldo</dt><dd>${client.balance.toLocaleString("es-AR")}</dd></div>
      </dl>
    </article>
  );

  return (
    <main className="container mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Clientes</h1>
        <Button aria-label="Nuevo cliente" onClick={openCreate} disabled={busy}><Plus /> <span className="sr-only sm:not-sr-only">Nuevo cliente</span></Button>
      </div>
      <div className="mb-5"><label htmlFor="client-search" className="sr-only">Buscar clientes</label><Input id="client-search" type="search" role="searchbox" placeholder="Buscar por nombre, teléfono, email o CUIT..." value={query} onChange={(event) => setQuery(event.target.value)} /></div>
      {notice && <p role="status" className="mb-4 text-sm">{notice}</p>}
      {formOpen && <section className="mb-6 rounded-lg border p-4"><h2 className="mb-4 text-lg font-semibold">{editing ? "Editar cliente" : "Nuevo cliente"}</h2><ClientForm client={editing} onSubmit={save} onCancel={() => { setFormOpen(false); setEditing(undefined); }} busy={busy} /></section>}
      {visible.length === 0 ? <div className="rounded-lg border border-dashed p-10 text-center"><p className="mb-4 text-muted-foreground">{initialError ?? "No hay clientes todavía"}</p><Button onClick={openCreate} disabled={busy}>Crear cliente</Button></div> : <>
        <div className="grid gap-3 md:hidden">{visible.map(clientCard)}</div>
        <div className="hidden overflow-x-auto rounded-lg border md:block"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-3">Nombre</th><th className="p-3">Teléfono</th><th className="p-3">Dirección</th><th className="p-3">CUIT</th><th className="p-3">Condición IVA</th><th className="p-3">Email</th><th className="p-3">Saldo</th><th className="p-3">Acciones</th></tr></thead><tbody>{visible.map((client) => <tr key={client.id} className="border-b last:border-0"><td className="p-3 font-medium">{client.name}</td><td className="p-3">{display(client.cellPhone)}</td><td className="p-3">{display(client.address)}</td><td className="p-3">{display(client.cuit)}</td><td className="p-3">{display(client.ivaCondition)}</td><td className="p-3 break-all">{display(client.email)}</td><td className="p-3">${client.balance.toLocaleString("es-AR")}</td><td className="p-3"><div className="flex gap-2"><Button variant="outline" size="icon" aria-label={`Editar ${client.name}`} disabled={busy} onClick={() => { setEditing(client); setFormOpen(true); }}><Pencil /></Button><Button variant="outline" size="icon" aria-label={`Eliminar ${client.name}`} disabled={busy} onClick={() => void remove(client)}><Trash2 /></Button></div></td></tr>)}</tbody></table></div>
      </>}
    </main>
  );
}
