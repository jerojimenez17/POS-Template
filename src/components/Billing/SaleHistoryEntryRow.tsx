"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SaleHistoryEntry } from "@/actions/sales/returns";

interface Props {
  entry: SaleHistoryEntry;
}

export default function SaleHistoryEntryRow({ entry }: Props) {
  if (entry.kind === "SALE") {
    return (
      <div data-testid="sale-row" className="flex items-center justify-between p-3 border-b bg-white">
        <div className="flex flex-col">
          <span className="font-medium">Venta #{String(entry.id).slice(-6)}</span>
          <span className="text-xs text-muted-foreground">{entry.date.toLocaleDateString()}</span>
        </div>
        <span className="font-semibold">${entry.total}</span>
      </div>
    );
  }

  const shortId = String(entry.orderId).slice(-6);
  return (
    <div
      data-testid="return-row"
      aria-label={`Devolución -$${entry.total} ref venta #${shortId}`}
      title={`${entry.reason ?? ""} ${entry.date.toLocaleDateString()}`}
      className="flex items-center justify-between p-3 border-b bg-red-50"
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Badge variant="destructive">Devolución</Badge>
          <span className="text-sm">Ref: Venta #{shortId}</span>
        </div>
        <span className="text-xs text-muted-foreground" title={entry.reason ?? undefined}>
          {entry.reason ?? ""} — {entry.date.toLocaleDateString()}
        </span>
        <Link href={`/sales/${entry.orderId}`} className="text-xs text-blue-600 hover:underline">
          Ver venta origen
        </Link>
      </div>
      <span className="font-bold text-red-600">-${entry.total}</span>
    </div>
  );
}
