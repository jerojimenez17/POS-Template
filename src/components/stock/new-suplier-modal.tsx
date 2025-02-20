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
import { Suplier } from "@/models/Suplier";
import { addSuplier } from "@/firebase/stock/newSuplier";

const NewSuplierModal = () => {
  const [suplier, setSuplier] = useState("");
  const [suplierEmail, setSuplierEmail] = useState("");
  const [suplierPhone, setSuplierPhone] = useState("");
  const [suplierBonus, setSuplierBonus] = useState(0);
  const [success, setSuccess] = useState(false);
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
              onChange={(e) => {
                if (e.currentTarget.value !== "") {
                  setSuplier(e.currentTarget.value);
                }
              }}
              className="col-span-3 text-gray-800"
            />
            <Label htmlFor="suplier-email" className="text-right">
              Email
            </Label>
            <Input
              id="suplier-email"
              placeholder="ejemplo@ejemplo.com"
              onChange={(e) => {
                if (e.currentTarget.value !== "") {
                  setSuplierEmail(e.currentTarget.value);
                }
              }}
              className="col-span-3 text-gray-800"
            />
            <Label htmlFor="suplier-phone" className="text-right">
              Telefono
            </Label>
            <Input
              id="suplier-phone"
              placeholder="EJ:223418113"
              onChange={(e) => {
                if (e.currentTarget.value !== "") {
                  setSuplierPhone(e.currentTarget.value);
                }
              }}
              className="col-span-3 text-gray-800"
            />
            <Label htmlFor="suplier-bonus" className="text-right">
              Bonificacion
            </Label>
            <Input
              id="suplier-bonus"
              type="number"
              defaultValue={suplierBonus !== 0 ? suplierBonus : ""}
              onChange={(e) => {
                if (e.currentTarget.value !== "") {
                  setSuplierBonus(Number(e.currentTarget.value));
                }
              }}
              className="col-span-3 text-gray-800"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={async () => {
              const newSuplier = new Suplier();
              newSuplier.name = suplier;
              newSuplier.bonus = suplierBonus;
              newSuplier.email = suplierEmail;
              if (suplier !== "") {
                await addSuplier(newSuplier);
                setSuccess(true);
              }
              setSuplier("");
            }}
            type="submit"
          >
            Agregar
          </Button>
          {success && <FormSuccess />}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NewSuplierModal;
