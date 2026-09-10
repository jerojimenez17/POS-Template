"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface OrderMock {
  id: string;
  products: Array<{
    id: string | null;
    code: string;
    description: string;
    salePrice: number;
    amount: number;
  }>;
  discount?: number;
  total?: number;
  totalWithDiscount?: number;
}

interface Props {
  order: OrderMock;
  availableByItem: Map<string, { available: number; alreadyReturned: number }>;
  onChange: (items: Array<{ productId: string; quantity: number; refundAmount: number }>) => void;
}

export default function ReturnItemSelector({ order, availableByItem, onChange }: Props) {
  const [quantities, setQuantities] = useState<Map<string, number>>(new Map());

  const getAvailable = (productId: string | null) => {
    if (!productId) {
      const first = Array.from(availableByItem.values())[0];
      return first ?? { available: 1, alreadyReturned: 0 };
    }
    return availableByItem.get(productId) ?? { available: 0, alreadyReturned: 0 };
  };

  const updateQuantity = (productId: string | null, newQty: number) => {
    const key = productId ?? "null-deleted";
    const avail = getAvailable(productId).available;
    const clamped = Math.max(0, Math.min(newQty, avail));
    const next = new Map(quantities);
    next.set(key, clamped);
    setQuantities(next);

    const discountFactor = order.discount && order.discount > 0 ? 1 - order.discount / 100 : 1;
    const items: Array<{ productId: string; quantity: number; refundAmount: number }> = [];
    for (const p of order.products) {
      const k = p.id ?? "null-deleted";
      const qty = next.get(k) ?? 0;
      if (qty > 0 && p.id) {
        const refundAmount = Math.round(qty * (p.salePrice ?? 0) * discountFactor);
        items.push({ productId: p.id!, quantity: qty, refundAmount });
      } else if (qty > 0 && !p.id) {
        // deleted product snapshot - use placeholder but still report
        const refundAmount = Math.round(qty * (p.salePrice ?? 0) * discountFactor);
        items.push({ productId: k, quantity: qty, refundAmount });
      }
    }
    onChange(items);
  };

  const getQty = (productId: string | null) => {
    const key = productId ?? "null-deleted";
    return quantities.get(key) ?? 0;
  };

  const discountFactor = order.discount && order.discount > 0 ? 1 - order.discount / 100 : 1;

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left p-2">Descripción</th>
              <th className="text-left p-2">Código</th>
              <th className="text-center p-2">Cantidad vendida</th>
              <th className="text-center p-2">Ya devuelto</th>
              <th className="text-center p-2">Disponible</th>
              <th className="text-center p-2">Cantidad a devolver</th>
              <th className="text-right p-2">Precio unit</th>
              <th className="text-right p-2">Refund</th>
            </tr>
          </thead>
          <tbody>
            {order.products.map((p, idx) => {
              const availInfo = getAvailable(p.id);
              const qty = getQty(p.id);
              const refund = Math.round(qty * (p.salePrice ?? 0) * discountFactor);
              return (
                <tr key={idx} className="border-b">
                  <td className="p-2">{p.description}</td>
                  <td className="p-2 font-mono">{p.code}</td>
                  <td className="p-2 text-center">{p.amount}</td>
                  <td className="p-2 text-center">{availInfo.alreadyReturned}</td>
                  <td className="p-2 text-center">{availInfo.available}</td>
                  <td className="p-2">
                    <div className="flex items-center gap-1 justify-center">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        aria-label="Disminuir"
                        onClick={() => updateQuantity(p.id, qty - 1)}
                      >
                        -
                      </Button>
                      <Input
                        value={qty}
                        onChange={(e) => updateQuantity(p.id, Number(e.target.value) || 0)}
                        className="w-12 h-7 text-center"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        aria-label="Aumentar"
                        onClick={() => updateQuantity(p.id, qty + 1)}
                      >
                        +
                      </Button>
                    </div>
                  </td>
                  <td className="p-2 text-right">${p.salePrice}</td>
                  <td className="p-2 text-right">${refund}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
