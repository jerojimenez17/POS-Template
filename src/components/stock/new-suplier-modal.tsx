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
import { FormSuccess } from "../ui/form-success";
import { createSupplier } from "@/actions/stock";
import { toast } from "sonner";

const NewSuplierModal = () => {
  const [suplier, setSuplier] = useState("");
  const [suplierEmail, setSuplierEmail] = useState("");
  const [suplierPhone, setSuplierPhone] = useState("");
  const [suplierBonus, setSuplierBonus] = useState(0);
  const [success, setSuccess] = useState(false);
  const [isPending, setIsPending] = useState(false);

  const handleAdd = async () => {
    if (suplier === "") return;
    setIsPending(true);
    setSuccess(false);
    try {
      const response = await createSupplier({
        name: suplier,
        email: suplierEmail,
        phone: suplierPhone,
        bonus: suplierBonus,
      });
      if (response.success) {
        setSuccess(true);
        setSuplier("");
        setSuplierEmail("");
        setSuplierPhone("");
        setSuplierBonus(0);
        toast.success("Proveedor agregado");
      } else {
        toast.error(response.error || "Error al agregar proveedor");
      }
    } catch (error) {
      toast.error("Error inesperado");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog>
      <DialogTrigger
        asChild
        className="h-9 ml-1 bg-black text-white font-semibold hover:text-gray-800"
      >
        <Button variant="outline">+ Nuevo</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Nuevo Proveedor</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="suplier-name" className="text-right">
              Nombre
            </Label>
            <Input
              id="suplier-name"
              placeholder="Ej: Proveedor-1"
              value={suplier}
              onChange={(e) => {
                setSuplier(e.currentTarget.value);
              }}
              className="col-span-3 text-gray-800"
              disabled={isPending}
            />
            <Label htmlFor="suplier-email" className="text-right">
              Email
            </Label>
            <Input
              id="suplier-email"
              value={suplierEmail}
              placeholder="ejemplo@ejemplo.com"
              onChange={(e) => {
                setSuplierEmail(e.currentTarget.value);
              }}
              className="col-span-3 text-gray-800"
              disabled={isPending}
            />
            <Label htmlFor="suplier-phone" className="text-right">
              Telefono
            </Label>
            <Input
              id="suplier-phone"
              value={suplierPhone}
              placeholder="EJ:223418113"
              onChange={(e) => {
                setSuplierPhone(e.currentTarget.value);
              }}
              className="col-span-3 text-gray-800"
              disabled={isPending}
            />
            <Label htmlFor="suplier-bonus" className="text-right">
              Bonificacion
            </Label>
            <Input
              id="suplier-bonus"
              type="number"
              value={suplierBonus !== 0 ? suplierBonus : ""}
              onChange={(e) => {
                setSuplierBonus(Number(e.currentTarget.value));
              }}
              className="col-span-3 text-gray-800"
              disabled={isPending}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={handleAdd}
            disabled={isPending}
            type="submit"
          >
            Agregar
          </Button>
          {success && <FormSuccess message="Proveedor agregado" />}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NewSuplierModal;
