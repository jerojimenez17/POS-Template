"use client";

import { useId, useState } from "react";

const PAYMENT_DOCUMENT_TYPES = [
  { value: "Factura A", label: "Factura A" },
  { value: "Factura B", label: "Factura B" },
  { value: "Factura C", label: "Factura C" },
  { value: "Remito", label: "Remito (sin emisión AFIP)" },
] as const;

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export function InvoiceTypeSelector({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const listboxId = useId();
  return (
    <div className="relative">
      <button
        type="button"
        role="combobox"
        aria-label="Tipo de factura"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-haspopup="listbox"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
          }
          if (event.key === "Escape") setOpen(false);
        }}
        className="flex h-9 w-full items-center justify-between rounded-md border bg-background px-3 text-left text-sm"
      >
        {value || "Seleccione Factura A, B o C"}
        <span aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div id={listboxId} role="listbox" aria-label="Tipos de factura" className="absolute z-50 mt-1 w-full rounded-md border bg-popover p-1 shadow-md">
          {PAYMENT_DOCUMENT_TYPES.map(({ value: type, label }) => (
            <button key={type} type="button" role="option" aria-selected={value === type} onClick={() => { onChange(type); setOpen(false); }} className="block w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent focus:bg-accent focus:outline-none">{label}</button>
          ))}
        </div>
      )}
    </div>
  );
}
