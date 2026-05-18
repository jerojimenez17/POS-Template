"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Package } from "lucide-react";
import { bulkUpdateAmounts } from "@/actions/stock";

interface Props {
  selectedCount: number;
  selectedIds: string[];
  onRefresh: () => void;
  disabled: boolean;
}

type UnitUpdateMode = 'set' | 'add' | 'subtract';

const MODE_LABELS: Record<UnitUpdateMode, string> = {
  set: "Establecer a",
  add: "Agregar",
  subtract: "Restar",
};

const BulkUnitUpdate = ({ selectedCount, selectedIds, onRefresh, disabled }: Props) => {
  const [amount, setAmount] = useState<string>("");
  const [mode, setMode] = useState<UnitUpdateMode>('set');
  const [loading, setLoading] = useState(false);

  const handleUpdate = async () => {
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      alert("Cantidad inválida");
      return;
    }

    if (selectedCount === 0) {
      alert("No hay productos seleccionados");
      return;
    }

    const modeText = MODE_LABELS[mode];
    if (!confirm(`¿${modeText} ${parsedAmount} unidades a ${selectedCount} productos?`)) {
      return;
    }

    setLoading(true);
    try {
      const result = await bulkUpdateAmounts(selectedIds, parsedAmount, mode);
      
      if (result.success) {
        alert("Cantidades actualizadas correctamente");
        onRefresh();
      } else {
        alert(result.error || "Error al actualizar cantidades");
      }
    } catch (error) {
      console.error("Error:", error);
      alert("Error al actualizar cantidades");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center dark:bg-gray-800/50 gap-2 p-4 bg-blue-50 rounded-md">
      <Package className="h-4 w-4 text-blue-600" />
      <select
        value={mode}
        onChange={(e) => setMode(e.target.value as UnitUpdateMode)}
        className="px-3 py-2 border rounded-md dark:bg-gray-800/50 bg-white"
        disabled={disabled}
      >
        <option value="set">Establecer a</option>
        <option value="add">Agregar</option>
        <option value="subtract">Restar</option>
      </select>
      <Input
        type="number"
        placeholder="Cantidad"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-24"
        min="0"
        step="0.01"
        disabled={disabled}
      />
      <Button 
        onClick={handleUpdate} 
        size="sm"
        variant="outline"
        disabled={disabled || loading || selectedCount === 0}
        className="border-blue-300 dark:bg-black hover:bg-blue-100"
      >
        {loading ? "Actualizando..." : "Aplicar"}
      </Button>
    </div>
  );
};

export default BulkUnitUpdate;
