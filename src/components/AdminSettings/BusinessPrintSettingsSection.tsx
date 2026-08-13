"use client";

import { useState } from "react";
import { updateBusinessPrintSettingsAction } from "@/actions/business-print-settings";
import { Switch } from "@/components/ui/switch";

interface Props { businessId: string; qzTray: boolean; address: string | null; }

export default function BusinessPrintSettingsSection({ businessId, qzTray, address }: Props) {
  const [enabled, setEnabled] = useState(qzTray);
  const [value, setValue] = useState(address ?? "");
  const [message, setMessage] = useState<string | null>(null);

  const save = async () => {
    const result = await updateBusinessPrintSettingsAction({ qzTray: enabled, address: value });
    setMessage(result.success ?? result.error ?? "");
  };

  return (
    <section className="rounded-lg border bg-white p-6 shadow-sm dark:bg-gray-800">
      <h2 className="text-xl font-semibold">Impresión del negocio</h2>
      <p className="mt-1 text-sm text-muted-foreground">Estos valores se aplican a nuevas ventas y reimpresiones.</p>
      <label className="mt-5 block text-sm font-medium" htmlFor={`business-address-${businessId}`}>Dirección del establecimiento</label>
      <input id={`business-address-${businessId}`} className="mt-2 w-full rounded-md border px-3 py-2" value={value} onChange={(event) => setValue(event.target.value)} />
      <div className="mt-4 flex items-center justify-between">
        <div><p className="font-medium">Usar QZ Tray</p><p className="text-sm text-muted-foreground">Si falla, se usa la impresión del navegador.</p></div>
        <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Usar QZ Tray" />
      </div>
      <button type="button" onClick={save} className="mt-5 rounded-md bg-primary px-4 py-2 text-primary-foreground">Guardar configuración</button>
      {message && <p className="mt-3 text-sm" role="status">{message}</p>}
    </section>
  );
}
