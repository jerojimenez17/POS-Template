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
import { createSubcategory } from "@/actions/subcategories";
import { toast } from "sonner";
import { Plus } from "lucide-react";

interface Props {
  categoryId?: string;
}

const NewSubcategoryModal = ({ categoryId }: Props) => {
  const [subcategory, setSubcategory] = useState("");
  const [success, setSuccess] = useState(false);
  const [isPending, setIsPending] = useState(false);

  const handleAdd = async () => {
    if (!categoryId) {
      toast.error("Seleccione una categoría primero");
      return;
    }
    if (subcategory === "") return;

    setIsPending(true);
    setSuccess(false);
    try {
      const response = await createSubcategory(subcategory, categoryId);
      if (response.success) {
        setSuccess(true);
        setSubcategory("");
        toast.success("Subcategoría creada");
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
    <Dialog>
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          size="icon" 
          className="shrink-0" 
          disabled={!categoryId}
        >
          <Plus className="h-4 w-4" />
          <span className="sr-only">Nueva Subcategoría</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Nueva Sub-Categoria</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="subcategory" className="text-right">
              Sub-Categoria
            </Label>
            <Input
              id="subcategory"
              value={subcategory}
              placeholder="Nueva subcategoria"
              onChange={(e) => {
                setSubcategory(e.currentTarget.value);
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
          {success && <FormSuccess message="Subcategoria creada" />}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NewSubcategoryModal;
