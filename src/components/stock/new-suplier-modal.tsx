"use client";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { useState } from "react";
import { createSupplier } from "@/actions/stock";
import { toast } from "sonner";
import { Plus, Truck } from "lucide-react";

const NewSuplierModal = () => {
  const [suplier, setSuplier] = useState("");
  const [suplierEmail, setSuplierEmail] = useState("");
  const [suplierPhone, setSuplierPhone] = useState("");
  const [suplierBonus, setSuplierBonus] = useState(0);
  const [isPending, setIsPending] = useState(false);
  const [open, setOpen] = useState(false);

  const handleAdd = async () => {
    if (suplier === "") return;
    setIsPending(true);
    try {
      const response = await createSupplier({
        name: suplier,
        email: suplierEmail,
        phone: suplierPhone,
        bonus: suplierBonus,
      });
      if (response.success) {
        toast.success("Proveedor creado");
        setSuplier("");
        setSuplierEmail("");
        setSuplierPhone("");
        setSuplierBonus(0);
        setOpen(false);
      } else {
        toast.error(response.error || "Error al crear proveedor");
      }
    } catch {
      toast.error("Error inesperado");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" className="shrink-0 h-9 w-9">
          <Plus className="h-4 w-4" />
          <span className="sr-only">Nuevo Proveedor</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Nuevo Proveedor
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="suplier-name" className="text-sm font-medium">
              Nombre <span className="text-red-500">*</span>
            </Label>
            <Input
              id="suplier-name"
              placeholder="Nombre del proveedor"
              value={suplier}
              onChange={(e) => setSuplier(e.currentTarget.value)}
              disabled={isPending}
              autoFocus
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="suplier-email" className="text-sm font-medium">
                Email
              </Label>
              <Input
                id="suplier-email"
                type="email"
                value={suplierEmail}
                placeholder="correo@ejemplo.com"
                onChange={(e) => setSuplierEmail(e.currentTarget.value)}
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="suplier-phone" className="text-sm font-medium">
                Teléfono
              </Label>
              <Input
                id="suplier-phone"
                type="tel"
                value={suplierPhone}
                placeholder="+54 9 2234 581234"
                onChange={(e) => setSuplierPhone(e.currentTarget.value)}
                disabled={isPending}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="suplier-bonus" className="text-sm font-medium">
              Bonificación %
            </Label>
            <Input
              id="suplier-bonus"
              type="number"
              min={0}
              max={100}
              value={suplierBonus !== 0 ? suplierBonus : ""}
              onChange={(e) => setSuplierBonus(Number(e.currentTarget.value))}
              placeholder="0"
              disabled={isPending}
            />
          </div>
        </div>
        <DialogFooter className="sm:justify-center">
          <Button
            onClick={handleAdd}
            disabled={isPending || !suplier.trim()}
            className="w-full sm:w-auto bg-black dark:bg-white dark:text-gray-900"
          >
            {isPending ? "Guardando..." : "Crear proveedor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NewSuplierModal;
