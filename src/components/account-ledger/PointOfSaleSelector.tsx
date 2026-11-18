"use client";

import { useId, useState } from "react";

interface Props {
  id?: string;
  values: number[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function PointOfSaleSelector({ id, values, value, onChange, disabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const listboxId = useId();
  return (
    <div className="relative">
      <button
        type="button"
        id={id}
        role="combobox"
        aria-label="Punto de venta"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-haspopup="listbox"
        disabled={disabled || values.length === 0}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
          }
          if (event.key === "Escape") setOpen(false);
        }}
        className="flex h-9 w-full items-center justify-between rounded-md border bg-background px-3 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50"
      >
        {value || "Seleccione un punto de venta"}
        <span aria-hidden="true">⌄</span>
      </button>
      {open && values.length > 0 && (
        <div id={listboxId} role="listbox" aria-label="Puntos de venta" className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md">
          {values.map((option) => (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={value === String(option)}
              onClick={() => { onChange(String(option)); setOpen(false); }}
              className="block w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent focus:bg-accent focus:outline-none"
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
