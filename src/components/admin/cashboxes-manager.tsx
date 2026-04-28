"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Edit2, Trash2, Plus, Box, History } from "lucide-react";
import { createCashbox, updateCashbox, deleteCashbox } from "@/actions/cashbox";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

interface CashboxType {
  id: string;
  name: string;
  total: number;
  businessId: string;
  updatedAt: Date;
}

interface CashboxesManagerProps {
  cashboxes: CashboxType[];
}

export const CashboxesManager = ({ cashboxes }: CashboxesManagerProps) => {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCashbox, setEditingCashbox] = useState<CashboxType | null>(null);
  const [cashboxName, setCashboxName] = useState("");
  const [saving, setSaving] = useState(false);

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [cashboxToDelete, setCashboxToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleCreate = () => {
    setEditingCashbox(null);
    setCashboxName("");
    setIsModalOpen(true);
  };

  const handleEdit = (cashbox: CashboxType) => {
    setEditingCashbox(cashbox);
    setCashboxName(cashbox.name);
    setIsModalOpen(true);
  };

  const confirmDelete = (id: string) => {
    setCashboxToDelete(id);
    setIsDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!cashboxToDelete) return;
    setIsDeleting(true);

    const result = await deleteCashbox(cashboxToDelete);
    setIsDeleting(false);
    setIsDeleteDialogOpen(false);
    setCashboxToDelete(null);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Caja eliminada");
      router.refresh();
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cashboxName.trim()) {
      toast.error("El nombre es obligatorio");
      return;
    }
    setSaving(true);

    if (editingCashbox) {
      const result = await updateCashbox(editingCashbox.id, cashboxName.trim());
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Caja actualizada");
        setIsModalOpen(false);
        router.refresh();
      }
    } else {
      const result = await createCashbox(cashboxName.trim());
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Caja creada");
        setIsModalOpen(false);
        router.refresh();
      }
    }

    setSaving(false);
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
    }).format(amount);

  return (
    <div className="w-full space-y-4">
      <div className="flex justify-between items-center w-full">
        <h2 className="text-2xl font-bold tracking-tight">Administración de Cajas</h2>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva Caja
        </Button>
      </div>

      <div className="rounded-md border bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 dark:bg-gray-800/50">
              <TableHead>Nombre</TableHead>
              <TableHead>Saldo Actual</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cashboxes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                  No hay cajas registradas.
                </TableCell>
              </TableRow>
            ) : (
              cashboxes.map((cashbox) => (
                <TableRow 
                  key={cashbox.id} 
                  className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 cursor-pointer"
                  onClick={() => router.push(`/admin/cashboxes/${cashbox.id}`)}
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <Box className="h-4 w-4 text-muted-foreground" />
                      {cashbox.name}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={cashbox.total >= 0 ? "default" : "destructive"} className={cashbox.total >= 0 ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-100" : ""}>
                      {formatCurrency(cashbox.total)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right space-x-2" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => router.push(`/admin/cashboxes/${cashbox.id}`)}
                      className="h-8 w-8 text-slate-500 hover:text-blue-600"
                      title="Ver historial"
                    >
                      <History className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(cashbox)}
                      className="h-8 w-8 text-slate-500 hover:text-blue-600"
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => confirmDelete(cashbox.id)}
                      className="h-8 w-8 text-slate-500 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create/Edit Modal */}
      <Dialog open={isModalOpen} onOpenChange={(open) => { if (!open) setIsModalOpen(false); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{editingCashbox ? "Editar Caja" : "Nueva Caja"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Nombre</label>
              <Input
                value={cashboxName}
                onChange={(e) => setCashboxName(e.target.value)}
                placeholder="Ej: Caja 1"
                autoFocus
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Guardando..." : editingCashbox ? "Guardar" : "Crear"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará la caja permanentemente. Los vendedores asignados a esta caja quedarán sin caja.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {isDeleting ? "Eliminando..." : "Sí, eliminar caja"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
