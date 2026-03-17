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
import { createSubcategory } from "@/actions/subcategories";
import { toast } from "sonner";
import { Plus, FolderTree } from "lucide-react";

interface Props {
  categoryId?: string;
}

const NewSubcategoryModal = ({ categoryId }: Props) => {
  const [subcategory, setSubcategory] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [open, setOpen] = useState(false);

  const handleAdd = async () => {
    if (!categoryId) {
      toast.error("Seleccione una categoría primero");
      return;
    }
    if (subcategory === "") return;

    setIsPending(true);
    try {
      const response = await createSubcategory(subcategory, categoryId);
      if (response.success) {
        toast.success("Subcategoría creada");
        setSubcategory("");
        setOpen(false);
      } else {
        toast.error(response.error || "Error al crear subcategoría");
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
        <Button 
          variant="outline" 
          size="icon" 
          className="shrink-0 h-9 w-9" 
          disabled={!categoryId}
          title={!categoryId ? "Seleccione una categoría primero" : "Nueva subcategoría"}
        >
          <Plus className="h-4 w-4" />
          <span className="sr-only">Nueva Subcategoría</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderTree className="h-5 w-5" />
            Nueva Subcategoría
          </DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <Label htmlFor="subcategory" className="text-sm font-medium">
            Nombre de la subcategoría
          </Label>
          <Input
            id="subcategory"
            value={subcategory}
            placeholder="Ej: Sin azúcar, Light, etc."
            onChange={(e) => setSubcategory(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="mt-1.5"
            disabled={isPending}
            autoFocus
          />
        </div>
        <DialogFooter className="sm:justify-center">
          <Button
            onClick={handleAdd}
            disabled={isPending || !subcategory.trim()}
            className="w-full sm:w-auto bg-black dark:bg-white dark:text-gray-900"
          >
            {isPending ? "Guardando..." : "Crear subcategoría"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NewSubcategoryModal;
