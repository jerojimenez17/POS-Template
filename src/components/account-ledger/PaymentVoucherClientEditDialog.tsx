"use client";

import { useState } from "react";
import { updateClient } from "@/actions/clients";
import type { ReactNode } from "react";
import { clientFormSchema } from "@/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTrigger,
  DialogTitle,
} from "@/components/ui/dialog";

export interface ClientFiscalData {
  id: string;
  name: string;
  address: string;
  cellPhone: string;
  cuit: string;
  ivaCondition: string;
  email: string;
  fiscalDocumentType: "CUIT" | "DNI" | null;
  fiscalDocumentNumber: string | null;
}

interface Props {
  client: ClientFiscalData;
  onSave?: (input: Record<string, string>) => Promise<void>;
  trigger?: ReactNode;
}

const IVA_CONDITIONS = ["Consumidor Final", "Responsable Inscripto", "Monotributista", "Exento"];

export function PaymentVoucherClientEditDialog({ client, onSave, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(client.name);
  const [address, setAddress] = useState(client.address);
  const [cellPhone, setCellPhone] = useState(client.cellPhone);
  const [ivaCondition, setIvaCondition] = useState(client.ivaCondition);
  const [email, setEmail] = useState(client.email);
  const hasTypedPair = (client.fiscalDocumentType === "CUIT" || client.fiscalDocumentType === "DNI")
    && Boolean(client.fiscalDocumentNumber?.trim());
  const legacyDocument = hasTypedPair
    ? { type: client.fiscalDocumentType, number: client.fiscalDocumentNumber }
    : { type: client.cuit ? "CUIT" as const : null, number: client.cuit || null };
  const [documentType, setDocumentType] = useState<"CUIT" | "DNI" | "">(legacyDocument.type ?? "");
  const [documentNumber, setDocumentNumber] = useState(legacyDocument.number ?? "");

  const setDialogOpen = (nextOpen: boolean) => {
    if (nextOpen) {
      setName(client.name);
      setAddress(client.address);
      setCellPhone(client.cellPhone);
      setIvaCondition(client.ivaCondition);
      setEmail(client.email);
      const typedPairExists = (client.fiscalDocumentType === "CUIT" || client.fiscalDocumentType === "DNI")
        && Boolean(client.fiscalDocumentNumber?.trim());
      const legacyPairExists = !client.fiscalDocumentType && !client.fiscalDocumentNumber && Boolean(client.cuit.trim());
      setDocumentType(typedPairExists ? client.fiscalDocumentType ?? "" : legacyPairExists ? "CUIT" : "");
      setDocumentNumber(typedPairExists ? client.fiscalDocumentNumber ?? "" : legacyPairExists ? client.cuit.trim() : "");
      setError(null);
    }
    setOpen(nextOpen);
  };

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const hasType = documentType !== "";
    const hasNumber = documentNumber.trim() !== "";
    if (hasType !== hasNumber) {
      setError("Seleccione un tipo e ingrese el número de documento");
      return;
    }
    const clientValidation = clientFormSchema.safeParse({
      name,
      address,
      cellPhone,
      cuit: documentType === "CUIT" ? documentNumber : "",
      ivaCondition,
      email,
    });
    if (!clientValidation.success) {
      setError(clientValidation.error.issues[0]?.message ?? "Los datos del cliente no son válidos");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const update = {
        id: client.id,
        name,
        address,
        cellPhone,
        cuit: documentType === "CUIT" ? documentNumber : "",
        ivaCondition,
        email,
        fiscalDocumentType: documentType,
        fiscalDocumentNumber: documentNumber,
      };
      if (onSave) {
        await onSave(update);
      } else {
        const result = await updateClient(update);
        if (!result.success) throw new Error("client_update_failed");
        window.location.reload();
      }
      setDialogOpen(false);
    } catch {
      setError("No se pudieron guardar los datos del cliente");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          {trigger ?? <Button type="button" variant="outline" size="sm">Editar datos fiscales del cliente</Button>}
        </DialogTrigger>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar datos fiscales del cliente</DialogTitle>
            <DialogDescription>Los cambios se guardan en la ficha del cliente y se aplicarán a futuras facturas.</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="grid gap-4">
            <div className="grid gap-2"><Label htmlFor="voucher-client-name">Nombre</Label><Input id="voucher-client-name" value={name} onChange={(event) => setName(event.target.value)} required disabled={busy} /></div>
            <div className="grid gap-2"><Label htmlFor="voucher-client-address">Dirección</Label><Input id="voucher-client-address" value={address} onChange={(event) => setAddress(event.target.value)} disabled={busy} /></div>
            <div className="grid gap-2"><Label htmlFor="voucher-client-phone">Teléfono</Label><Input id="voucher-client-phone" value={cellPhone} onChange={(event) => setCellPhone(event.target.value)} disabled={busy} /></div>
            <div className="grid gap-2"><Label htmlFor="voucher-client-iva">Condición IVA</Label><select id="voucher-client-iva" aria-label="Condición IVA" className="h-9 rounded-md border bg-background px-3 text-sm" value={ivaCondition} onChange={(event) => setIvaCondition(event.target.value)} disabled={busy}><option value="">Seleccionar...</option>{IVA_CONDITIONS.map((condition) => <option key={condition}>{condition}</option>)}</select></div>
            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium">Identidad fiscal</legend>
              <div className="flex gap-5">
                {(["CUIT", "DNI"] as const).map((type) => <label key={type} className="flex items-center gap-2"><input type="radio" name="voucher-fiscal-document-type" value={type} checked={documentType === type} onChange={() => {
                  if (documentType !== type) setDocumentNumber("");
                  setDocumentType(type);
                }} disabled={busy} />{type}</label>)}
              </div>
              <Button type="button" variant="ghost" className="w-fit px-0" onClick={() => { setDocumentType(""); setDocumentNumber(""); }} disabled={busy}>Quitar identidad</Button>
              <Label htmlFor="voucher-document-number">Número de documento</Label>
              <Input id="voucher-document-number" inputMode="numeric" value={documentNumber} onChange={(event) => setDocumentNumber(event.target.value)} disabled={busy || !documentType} />
            </fieldset>
            <div className="grid gap-2"><Label htmlFor="voucher-client-email">Email</Label><Input id="voucher-client-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} /></div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? "Guardando..." : "Guardar"}</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
