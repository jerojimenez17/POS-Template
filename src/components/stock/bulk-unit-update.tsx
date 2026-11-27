"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Package } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { bulkUpdateAmounts } from "@/actions/stock";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

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

type DialogConfig = {
  open: boolean;
  title: string;
  description: string;
  variant: "info" | "confirm";
  onConfirm?: () => Promise<void> | void;
};

const BulkUnitUpdate = ({ selectedCount, selectedIds, onRefresh, disabled }: Props) => {
  const [amount, setAmount] = useState<string>("");
  const [mode, setMode] = useState<UnitUpdateMode>('set');
  const [loading, setLoading] = useState(false);
  const [dialog, setDialog] = useState<DialogConfig>({
    open: false,
    title: "",
    description: "",
    variant: "info",
  });

  const showDialog = (title: string, description: string, variant: "info" | "confirm" = "info", onConfirm?: () => Promise<void> | void) => {
    setDialog({ open: true, title, description, variant, onConfirm });
  };

  const handleUpdate = async () => {
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      showDialog("Error", "Cantidad inválida");
      return;
    }

    if (selectedCount === 0) {
      showDialog("Error", "No hay productos seleccionados");
      return;
    }

    const modeText = MODE_LABELS[mode];
    showDialog(
      "Confirmar actualización",
      `¿${modeText} ${parsedAmount} unidades a ${selectedCount} productos?`,
      "confirm",
      async () => {
        setLoading(true);
        setDialog(prev => ({ ...prev, open: false }));
        try {
          const result = await bulkUpdateAmounts(selectedIds, parsedAmount, mode);
          if (result.success) {
            showDialog("Éxito", "Cantidades actualizadas correctamente");
            onRefresh();
          } else {
            showDialog("Error", result.error || "Error al actualizar cantidades");
          }
        } catch (error) {
          console.error("Error:", error);
          showDialog("Error", "Error al actualizar cantidades");
        } finally {
          setLoading(false);
        }
      }
    );
  };

  return (
    <div className="space-y-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-800">
      <div className="flex items-center gap-2 font-medium text-sm">
        <Package className="h-4 w-4 text-blue-500" />
        Actualización de Stock
      </div>
      <div className="space-y-2">
        <Select value={mode} onValueChange={(val) => setMode(val as UnitUpdateMode)} disabled={disabled}>
          <SelectTrigger className="w-full bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 h-9">
            <SelectValue placeholder="Acción a realizar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="set">Reemplazar cantidad exacta (=)</SelectItem>
            <SelectItem value="add">Sumar a la cantidad actual (+)</SelectItem>
            <SelectItem value="subtract">Restar de la cantidad actual (-)</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Input
            type="number"
            placeholder="Cantidad…"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="flex-1 min-w-0 h-9 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 focus-visible:ring-2 focus-visible:ring-blue-500"
            min="0"
            step="0.01"
            disabled={disabled}
          />
          <Button 
            onClick={handleUpdate} 
            size="sm"
            variant="outline"
            disabled={disabled || loading || selectedCount === 0}
            className="shrink-0 h-9"
          >
            {loading ? "Actualizando..." : "Aplicar"}
          </Button>
        </div>
      </div>

      <AlertDialog open={dialog.open} onOpenChange={(open) => setDialog(prev => ({ ...prev, open }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialog.title}</AlertDialogTitle>
            <AlertDialogDescription>{dialog.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {dialog.variant === "confirm" ? (
              <>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={dialog.onConfirm}>Confirmar</AlertDialogAction>
              </>
            ) : (
              <AlertDialogAction onClick={() => setDialog(prev => ({ ...prev, open: false }))}>
                Aceptar
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default BulkUnitUpdate;
