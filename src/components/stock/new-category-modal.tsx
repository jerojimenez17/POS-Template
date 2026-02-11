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
import { FormSuccess } from "../ui/form-success";
import { toast } from "sonner";

const NewCategoryModal = () => {
  const [category, setCategory] = useState("");
  const [success, setSuccess] = useState(false);
  const [isPending, setIsPending] = useState(false);

  const handleAdd = async () => {
    if (category === "") return;
    setIsPending(true);
    setSuccess(false);
    try {
      const response = await createCategory(category);
      if (response.success) {
        setSuccess(true);
        setCategory("");
        toast.success("Categoría creada");
      } else {
        toast.error(response.error || "Error al crear categoría");
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
        className="h-10 bg-black text-white font-semibold hover:text-gray-800"
      >
        <Button variant="outline">+ Nueva</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Nueva Categoria</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="category" className="text-right">
              Categoria
            </Label>
            <Input
              id="category"
              value={category}
              placeholder="Nueva Categoria"
              onChange={(e) => {
                setCategory(e.currentTarget.value);
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
          {success && <FormSuccess message="Categoria creada" />}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NewCategoryModal;
