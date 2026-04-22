"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Trash2 } from "lucide-react";
import { deleteOrderAction } from "@/actions/sales/filtered";
import { toast } from "sonner";

interface DeleteConfirmDialogProps {
  saleId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}

export default function DeleteConfirmDialog({
  saleId,
  open,
  onOpenChange,
  onDeleted,
}: DeleteConfirmDialogProps) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const result = await deleteOrderAction(saleId);
      if (result.success) {
        toast.success("Venta desestimada correctamente");
        onOpenChange(false);
        onDeleted?.();
      } else {
        toast.error(result.error || "Error al desestimar la venta");
      }
    } catch (error) {
      console.error("Error deleting sale:", error);
      toast.error("Error al desestimar la venta");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 hover:bg-red-50"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onOpenChange(true);
        }}
      >
        <Trash2 className="h-4 w-4 text-red-500" />
      </Button>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Desestimar Venta</AlertDialogTitle>
          <AlertDialogDescription>
            ¿Estás seguro de que deseas desestimar esta venta? El stock será reintegrado
            y la venta será marcada como cancelada. Esta acción no se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={deleting}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {deleting ? "Desestimando..." : "Desestimar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}