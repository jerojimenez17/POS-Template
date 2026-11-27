"use client";

import { useState } from "react";
import { updateBusinessPrintSettingsAction } from "@/actions/business-print-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface Props {
  businessId: string;
  qzTray: boolean;
  address: string | null;
}

type SaveState = "idle" | "pending" | "success" | "error";

export default function BusinessPrintSettingsSection({ businessId, qzTray, address }: Props) {
  const [enabled, setEnabled] = useState(qzTray);
  const [value, setValue] = useState(address ?? "");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const save = async () => {
    if (saveState === "pending") return;

    setSaveState("pending");
    setMessage("Guardando configuración...");

    try {
      const normalizedAddress = value.trim() || null;
      const result = await updateBusinessPrintSettingsAction({
        qzTray: enabled,
        address: normalizedAddress,
      });

      if (result.error) {
        setSaveState("error");
        setMessage(result.error);
        return;
      }

      setValue(normalizedAddress ?? "");
      setSaveState("success");
      setMessage(result.success ?? "Configuración guardada");
    } catch {
      setSaveState("error");
      setMessage("No se pudo guardar la configuración de impresión");
    }
  };

  return (
    <section className="rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm">
      <h2 className="text-xl font-semibold">Impresión del negocio</h2>
      <p className="mt-1 text-sm text-muted-foreground">Estos valores se aplican a nuevas ventas y reimpresiones.</p>
      <div className="mt-5 space-y-2">
        <Label htmlFor={`business-address-${businessId}`}>Dirección del establecimiento</Label>
        <Input
          id={`business-address-${businessId}`}
          name="address"
          autoComplete="street-address"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </div>
      <div className="mt-5 flex items-center justify-between gap-4">
        <div>
          <Label htmlFor={`business-qz-${businessId}`} id={`business-qz-label-${businessId}`}>
            Usar QZ Tray para impresión térmica
          </Label>
          <p id={`business-qz-description-${businessId}`} className="mt-1 text-sm text-muted-foreground">
            Preferencia guardada para este negocio. Si está desactivado o QZ Tray no está disponible, se usa la impresión HTML del navegador.
          </p>
        </div>
        <Switch
          id={`business-qz-${businessId}`}
          checked={enabled}
          onCheckedChange={setEnabled}
          aria-labelledby={`business-qz-label-${businessId}`}
          aria-describedby={`business-qz-description-${businessId}`}
        />
      </div>
      <div className="mt-5 flex justify-center">
        <Button type="button" onClick={save} disabled={saveState === "pending"}>
          {saveState === "pending" ? "Guardando..." : "Guardar configuración"}
        </Button>
      </div>
      <p
        className={cnStatus(saveState)}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {message}
      </p>
    </section>
  );
}

function cnStatus(state: SaveState): string {
  return state === "error"
    ? "mt-3 text-sm text-destructive"
    : state === "success"
      ? "mt-3 text-sm text-primary"
      : "mt-3 min-h-5 text-sm text-muted-foreground";
}
