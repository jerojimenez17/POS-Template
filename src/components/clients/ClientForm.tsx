"use client";

import { useState } from "react";
import { clientFormSchema } from "@/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ClientListItem } from "@/actions/clients";

interface ClientFormProps { client?: ClientListItem; onSubmit: (value: Record<string, string>) => Promise<void>; onCancel: () => void; busy?: boolean; }
const fields = [["name", "Nombre"], ["cellPhone", "Teléfono"], ["address", "Dirección"], ["cuit", "CUIT"]] as const;

export default function ClientForm({ client, onSubmit, onCancel, busy }: ClientFormProps) {
  const [values, setValues] = useState<Record<string, string>>({ name: client?.name ?? "", cellPhone: client?.cellPhone ?? "", address: client?.address ?? "", cuit: client?.cuit ?? "", ivaCondition: client?.ivaCondition ?? "", email: client?.email ?? "" });
  const [error, setError] = useState<string>();
  const change = (key: string, value: string) => setValues((current) => ({ ...current, [key]: value }));
  const submit = async (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); const parsed = clientFormSchema.safeParse(values); if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Datos inválidos"); return; } setError(undefined); await onSubmit(parsed.data); };
  return <form onSubmit={submit} className="grid gap-4" noValidate>
    {fields.map(([key, label]) => <div className="grid gap-2" key={key}><Label htmlFor={`client-${key}`}>{label}{key === "name" ? " *" : ""}</Label><Input id={`client-${key}`} value={values[key] ?? ""} onChange={(e) => change(key, e.target.value)} disabled={busy} /></div>)}
    <div className="grid gap-2"><Label htmlFor="client-ivaCondition">Condición IVA</Label><select id="client-ivaCondition" className="h-9 rounded-md border bg-background px-3 text-sm" value={values.ivaCondition} onChange={(e) => change("ivaCondition", e.target.value)} disabled={busy}><option value="">Seleccionar...</option>{["Consumidor Final", "Responsable Inscripto", "Monotributista", "Exento"].map((value) => <option key={value}>{value}</option>)}</select></div>
    <div className="grid gap-2"><Label htmlFor="client-email">Email</Label><Input id="client-email" type="email" value={values.email} onChange={(e) => change("email", e.target.value)} disabled={busy} /></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onCancel} disabled={busy}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? "Guardando..." : "Guardar cliente"}</Button></div>
  </form>;
}
