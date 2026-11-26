"use client";

import { useEffect, useState } from "react";
import { clientFormSchema } from "@/schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ClientListItem } from "@/actions/clients";
import { cn } from "@/lib/utils";

interface ClientFormProps {
  client?: ClientListItem;
  onSubmit: (value: Record<string, string>) => Promise<void>;
  onCancel: () => void;
  busy?: boolean;
}

const FIELDS = [
  ["name", "Nombre", true],
  ["cellPhone", "Teléfono", false],
  ["address", "Dirección", false],
  ["cuit", "CUIT", false],
] as const;

const IVA_CONDITIONS = ["Consumidor Final", "Responsable Inscripto", "Monotributista", "Exento"];

const getInitialValues = (client?: ClientListItem): Record<string, string> => ({
  name: client?.name ?? "",
  cellPhone: client?.cellPhone ?? "",
  address: client?.address ?? "",
  cuit: client?.cuit ?? "",
  ivaCondition: client?.ivaCondition ?? "",
  email: client?.email ?? "",
});

export default function ClientForm({ client, onSubmit, onCancel, busy }: ClientFormProps) {
  const [values, setValues] = useState<Record<string, string>>(() => getInitialValues(client));
  const [errors, setErrors] = useState<Record<string, string>>({});

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setValues(getInitialValues(client));
    setErrors({});
  }, [client]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const change = (key: string, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = clientFormSchema.safeParse(values);
    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path[0];
        if (typeof path === "string" && !nextErrors[path]) nextErrors[path] = issue.message;
      }
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    await onSubmit(parsed.data);
  };

  const fieldError = (key: string): string | undefined => errors[key];

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      {FIELDS.map(([key, label, required]) => {
        const error = fieldError(key);
        return (
          <div className="grid gap-2" key={key}>
            <Label htmlFor={`client-${key}`} className={cn(error && "text-destructive")}>
              {label}{required ? " *" : ""}
            </Label>
            <Input
              id={`client-${key}`}
              type="text"
              value={values[key] ?? ""}
              onChange={(event) => change(key, event.target.value)}
              disabled={busy}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `client-${key}-error` : undefined}
              className={cn(error && "border-destructive focus-visible:ring-destructive")}
            />
            {error && (
              <p id={`client-${key}-error`} role="alert" className="text-[0.8rem] font-medium text-destructive">{error}</p>
            )}
          </div>
        );
      })}

      <div className="grid gap-2">
        <Label htmlFor="client-ivaCondition" className={cn(fieldError("ivaCondition") && "text-destructive")}>
          Condición IVA
        </Label>
        <select
          id="client-ivaCondition"
          className={cn("h-9 rounded-md border bg-background px-3 text-sm", fieldError("ivaCondition") && "border-destructive")}
          value={values.ivaCondition}
          onChange={(event) => change("ivaCondition", event.target.value)}
          disabled={busy}
          aria-invalid={Boolean(fieldError("ivaCondition"))}
          aria-describedby={fieldError("ivaCondition") ? "client-ivaCondition-error" : undefined}
        >
          <option value="">Seleccionar...</option>
          {IVA_CONDITIONS.map((value) => <option key={value}>{value}</option>)}
        </select>
        {fieldError("ivaCondition") && (
          <p id="client-ivaCondition-error" role="alert" className="text-[0.8rem] font-medium text-destructive">{fieldError("ivaCondition")}</p>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="client-email" className={cn(fieldError("email") && "text-destructive")}>
          Email
        </Label>
        <Input
          id="client-email"
          type="email"
          value={values.email}
          onChange={(event) => change("email", event.target.value)}
          disabled={busy}
          aria-invalid={Boolean(fieldError("email"))}
          aria-describedby={fieldError("email") ? "client-email-error" : undefined}
          className={cn(fieldError("email") && "border-destructive focus-visible:ring-destructive")}
        />
        {fieldError("email") && (
          <p id="client-email-error" role="alert" className="text-[0.8rem] font-medium text-destructive">{fieldError("email")}</p>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>Cancelar</Button>
        <Button type="submit" disabled={busy}>{busy ? "Guardando..." : "Guardar cliente"}</Button>
      </div>
    </form>
  );
}
