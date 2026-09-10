"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  items: Array<{ productId: string; quantity: number; refundAmount: number }>;
  reason: string;
  onReasonChange: (v: string) => void;
  totalRefund: number;
  onConfirm: () => void;
  onCancel: () => void;
  availableMap?: Map<string, number>;
}

export default function ReturnSummary({ items, reason, onReasonChange, totalRefund, onConfirm, onCancel, availableMap }: Props) {

  const hasQuantity = items.some((i) => i.quantity > 0);
  const exceeds = availableMap
    ? items.some((i) => {
        const avail = availableMap.get(i.productId);
        if (avail !== undefined) return i.quantity > avail;
        return false;
      })
    : false;

  const reasonInvalid = !reason || reason.trim().length < 3;
  const reasonTooLong = !!reason && reason.length > 500;
  const disabled = !hasQuantity || exceeds || reasonInvalid || reasonTooLong;

  return (
    <div className="space-y-4 border-t pt-4">
      <div>
        <label className="text-sm font-medium">Motivo</label>
        <Textarea
          placeholder="Motivo de la devolución"
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
          maxLength={500}
          className="mt-1"
        />
        {reasonInvalid && reason.length > 0 && <p className="text-sm text-red-600 mt-1">Motivo mínimo 3 caracteres</p>}
        {reason.trim().length === 0 && items.length > 0 && <p className="text-sm text-red-600 mt-1">Motivo mínimo 3 caracteres</p>}
        {reasonTooLong && <p className="text-sm text-red-600 mt-1">Máximo 500 caracteres</p>}
      </div>

      <div className="flex justify-between items-center">
        <span className="font-semibold">Total reintegro:</span>
        <span className="font-bold text-lg">${totalRefund}</span>
      </div>

      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button onClick={onConfirm} disabled={disabled}>
          Confirmar
        </Button>
      </div>
    </div>
  );
}
