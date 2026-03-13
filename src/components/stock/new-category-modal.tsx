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
import { createCategory } from "@/actions/categories";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, FolderPlus } from "lucide-react";

const NewCategoryModal = () => {
  const [category, setCategory] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [open, setOpen] = useState(false);

  const handleAdd = async () => {
    if (category === "") return;
    setIsPending(true);
    try {
      const response = await createCategory(category);
      if (response.success) {
        toast.success("Categoría creada");
        setCategory("");
        setOpen(false);
      } else {
        toast.error(response.error || "Error al crear categoría");
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
          <span className="sr-only">Nueva Categoría</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderPlus className="h-5 w-5" />
            Nueva Categoría
          </DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <Label htmlFor="category" className="text-sm font-medium">
            Nombre de la categoría
          </Label>
          <Input
            id="category"
            value={category}
            placeholder="Ej: Bebidas, Lácteos, etc."
            onChange={(e) => setCategory(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="mt-1.5"
            disabled={isPending}
            autoFocus
          />
        </div>
        <DialogFooter className="sm:justify-center">
          <Button
            onClick={handleAdd}
            disabled={isPending || !category.trim()}
            className="w-full sm:w-auto bg-black dark:bg-white dark:text-gray-900"
          >
            {isPending ? "Guardando..." : "Crear categoría"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NewCategoryModal;
