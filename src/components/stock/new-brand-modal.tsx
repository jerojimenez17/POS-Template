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
import { createBrand } from "@/actions/brands";
import { toast } from "sonner";
import { Plus } from "lucide-react";

const NewBrandModal = () => {
  const [brand, setBrand] = useState("");
  const [success, setSuccess] = useState(false);
  const [isPending, setIsPending] = useState(false);

  const handleAdd = async () => {
    if (brand === "") return;
    setIsPending(true);
    setSuccess(false);
    try {
      const response = await createBrand(brand);
      if (response.success) {
        setSuccess(true);
        setBrand("");
        toast.success("Marca creada");
      } else {
        toast.error(response.error || "Error al crear marca");
      }
    } catch {
      toast.error("Error inesperado");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" className="shrink-0">
          <Plus className="h-4 w-4" />
          <span className="sr-only">Nueva Marca</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Nueva Marca</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="brand" className="text-right">
              Marca
            </Label>
            <Input
              id="brand"
              value={brand}
              placeholder="Marca"
              onChange={(e) => {
                setBrand(e.currentTarget.value);
              }}
              className="col-span-3 border-black text-gray-800"
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
          {success && <FormSuccess message="Marca agregada!" />}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NewBrandModal;
