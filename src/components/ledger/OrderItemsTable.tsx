"use client";

import { useState } from "react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Trash2, Plus } from "lucide-react";

interface OrderItem {
  id: string;
  productId?: string;
  description: string;
  price: number;
  quantity: number;
  subTotal: number;
  addedAt: Date;
}

interface OrderItemsTableProps {
  items: OrderItem[];
  isEditable: boolean;
  onUpdateQuantity?: (itemId: string, quantity: number) => void;
  onUpdatePrice?: (itemId: string, price: number) => void;
  onRemoveItem?: (itemId: string) => void;
  onAddItem?: () => void;
}

const formatDate = (date: Date): string => {
  const d = new Date(date);
  const today = new Date();
  
  const isSameDay = 
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();
  
  if (isSameDay) {
    return "Hoy";
  }
  
  const day = d.getDate().toString().padStart(2, "0");
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  const year = d.getFullYear();
  const hours = d.getHours().toString().padStart(2, "0");
  const minutes = d.getMinutes().toString().padStart(2, "0");
  
  return `${day}/${month}/${year} ${hours}:${minutes}`;
};

const groupItemsByDate = (items: OrderItem[]): Map<string, OrderItem[]> => {
  const groups = new Map<string, OrderItem[]>();
  
  items.forEach((item) => {
    const dateKey = new Date(item.addedAt).toISOString().split("T")[0];
    const existing = groups.get(dateKey) || [];
    groups.set(dateKey, [...existing, item]);
  });
  
  return groups;
};

export default function OrderItemsTable({
  items,
  isEditable,
  onUpdateQuantity,
  onUpdatePrice,
  onRemoveItem,
  onAddItem,
}: OrderItemsTableProps) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const groupedItems = groupItemsByDate(items);
  const sortedDates = Array.from(groupedItems.keys()).sort((a, b) => 
    new Date(b).getTime() - new Date(a).getTime()
  );

  const handleQuantityChange = (itemId: string, value: string) => {
    const qty = parseFloat(value) || 0;
    setQuantities((prev) => ({ ...prev, [itemId]: qty }));
  };

  const handleQuantityBlur = (itemId: string, originalQuantity: number) => {
    const newQty = quantities[itemId];
    if (newQty !== undefined && newQty !== originalQuantity && onUpdateQuantity) {
      onUpdateQuantity(itemId, newQty);
    }
  };

  const getTotal = () => {
    return items.reduce((sum, item) => sum + item.subTotal, 0);
  };

  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No hay items en la orden
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {sortedDates.map((dateKey) => {
        const dateItems = groupedItems.get(dateKey) || [];
        const firstItem = dateItems[0];
        const displayDate = firstItem ? formatDate(firstItem.addedAt) : "";

        return (
          <div key={dateKey} className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">
              Agregado el {displayDate}
            </h3>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-3 text-sm font-medium">Producto</th>
                    <th className="text-right p-3 text-sm font-medium">Precio</th>
                    <th className="text-right p-3 text-sm font-medium">Cantidad</th>
                    <th className="text-right p-3 text-sm font-medium">Subtotal</th>
                    {isEditable && (
                      <th className="p-3 text-sm font-medium w-[50px]"></th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {dateItems.map((item: OrderItem) => (
                    <tr key={item.id} className="border-t">
                      <td className="p-3">{item.description}</td>
                      <td className="p-3 text-right">
                        {isEditable ? (
                          <Input
                            type="number"
                            value={item.price}
                            onChange={(e) => {
                              if (onUpdatePrice) {
                                onUpdatePrice(item.id, parseFloat(e.target.value) || 0);
                              }
                            }}
                            className="w-24 text-right"
                          />
                        ) : (
                          <span>${item.price.toLocaleString("es-AR")}</span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        {isEditable ? (
                          <Input
                            data-testid="quantity-input"
                            type="number"
                            value={quantities[item.id] ?? item.quantity}
                            onChange={(e) => handleQuantityChange(item.id, e.target.value)}
                            onBlur={() => handleQuantityBlur(item.id, item.quantity)}
                            className="w-20 text-right"
                          />
                        ) : (
                          item.quantity
                        )}
                      </td>
                      <td className="p-3 text-right font-medium">
                        <span>${item.subTotal.toLocaleString("es-AR")}</span>
                      </td>
                      {isEditable && (
                        <td className="p-3">
                          <Button
                            data-testid="remove-button"
                            variant="ghost"
                            size="icon"
                            onClick={() => onRemoveItem?.(item.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {isEditable && onAddItem && (
        <Button variant="outline" onClick={onAddItem} className="w-full">
          <Plus className="h-4 w-4 mr-2" />
          Agregar producto
        </Button>
      )}

      <div className="flex justify-end p-4 bg-muted rounded-lg">
        <div className="text-right">
          <p className="text-sm text-muted-foreground">Total:</p>
          <p className="text-2xl font-bold">
            <span>${getTotal().toLocaleString("es-AR")}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
