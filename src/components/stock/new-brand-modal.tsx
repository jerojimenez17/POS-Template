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
import { createBrand } from "@/actions/brands";
import { toast } from "sonner";
import { Plus, Tag } from "lucide-react";

const NewBrandModal = () => {
  const [brand, setBrand] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [open, setOpen] = useState(false);

  const handleAdd = async () => {
    if (brand === "") return;
    setIsPending(true);
    try {
      const response = await createBrand(brand);
      if (response.success) {
        toast.success("Marca creada");
        setBrand("");
        setOpen(false);
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" className="shrink-0 h-9 w-9">
          <Plus className="h-4 w-4" />
          <span className="sr-only">Nueva Marca</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            Nueva Marca
          </DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <Label htmlFor="brand" className="text-sm font-medium">
            Nombre de la marca
          </Label>
          <Input
            id="brand"
            value={brand}
            placeholder="Ej: Coca-Cola, Pepsi, etc."
            onChange={(e) => setBrand(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="mt-1.5"
            disabled={isPending}
            autoFocus
          />
        </div>
        <DialogFooter className="sm:justify-center">
          <Button
            onClick={handleAdd}
            disabled={isPending || !brand.trim()}
            className="w-full sm:w-auto bg-black dark:bg-white dark:text-gray-900"
          >
            {isPending ? "Guardando..." : "Crear marca"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NewBrandModal;
