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
import { createCategory } from "@/actions/categories";
import { createBrand } from "@/actions/brands";
import { createSubcategory } from "@/actions/subcategories";
import { createSupplier } from "@/actions/stock";
import { toast } from "sonner";
import { Plus, FolderPlus, FolderTree, Tag, Truck } from "lucide-react";
import { DialogDescription } from "@radix-ui/react-dialog";

type AttributeType = "category" | "subcategory" | "brand" | "supplier";

interface Props {
  type: AttributeType;
  parentId?: string;
  onSuccess: (item: { id: string; name: string }) => void;
}

const CONFIG: Record<AttributeType, { icon: React.ReactNode; title: string; description: string }> = {
  category: {
    icon: <FolderPlus className="h-5 w-5" />,
    title: "Nueva Categoría",
    description: "Agregue una nueva categoría para organizar sus productos.",
  },
  subcategory: {
    icon: <FolderTree className="h-5 w-5" />,
    title: "Nueva Subcategoría",
    description: "Agregue una subcategoría para clasificar mejor sus productos.",
  },
  brand: {
    icon: <Tag className="h-5 w-5" />,
    title: "Nueva Marca",
    description: "Cree una nueva marca para asignar a sus productos.",
  },
  supplier: {
    icon: <Truck className="h-5 w-5" />,
    title: "Nuevo Proveedor",
    description: "Agregue los datos de contacto de su nuevo proveedor.",
  },
};

const CreateAttributeModal = ({ type, parentId, onSuccess }: Props) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [bonus, setBonus] = useState(0);
  const [isPending, setIsPending] = useState(false);
  const [open, setOpen] = useState(false);

  const resetForm = () => {
    setName("");
    setEmail("");
    setPhone("");
    setBonus(0);
  };

  const handleAdd = async () => {
    if (!name.trim()) return;

    setIsPending(true);
    try {
      let result;

      switch (type) {
        case "category":
          result = await createCategory(name);
          if (result.success && result.category) {
            onSuccess({ id: result.category.id, name: result.category.name });
            toast.success("Categoría creada");
          }
          break;

        case "subcategory":
          if (!parentId) {
            toast.error("Seleccione una categoría primero");
            return;
          }
          result = await createSubcategory(name, parentId);
          if (result.success && result.subcategory) {
            onSuccess({ id: result.subcategory.id, name: result.subcategory.name });
            toast.success("Subcategoría creada");
          }
          break;

        case "brand":
          result = await createBrand(name);
          if (result.success && result.brand) {
            onSuccess({ id: result.brand.id, name: result.brand.name });
            toast.success("Marca creada");
          }
          break;

        case "supplier":
          result = await createSupplier({ name, email, phone, bonus });
          if (result.success && result.supplier) {
            onSuccess({ id: result.supplier.id, name: result.supplier.name });
            toast.success("Proveedor creado");
          }
          break;
      }

      if (result?.error) {
        toast.error(result.error);
      }
    } catch {
      toast.error("Error inesperado");
    } finally {
      setIsPending(false);
      if (name.trim()) {
        resetForm();
        setOpen(false);
      }
    }
  };

  const isDisabled = type === "subcategory" && !parentId;
  const config = CONFIG[type];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="shrink-0 h-9 w-9"
          disabled={isDisabled}
          title={isDisabled ? "Seleccione una categoría primero" : `Nueva ${type}`}
        >
          <Plus className="h-4 w-4" />
          <span className="sr-only">Nueva {type}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className={type === "supplier" ? "sm:max-w-lg" : "sm:max-w-md"}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {config.icon}
            {config.title}
          </DialogTitle>
          <DialogDescription>{config.description}</DialogDescription>
        </DialogHeader>

        {type === "supplier" ? (
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">
                Nombre <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                placeholder="Nombre del proveedor"
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                disabled={isPending}
                autoFocus
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  placeholder="correo@ejemplo.com"
                  onChange={(e) => setEmail(e.currentTarget.value)}
                  disabled={isPending}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Teléfono</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  placeholder="+54 9 2234 581234"
                  onChange={(e) => setPhone(e.currentTarget.value)}
                  disabled={isPending}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bonus">Bonificación %</Label>
              <Input
                id="bonus"
                type="number"
                min={0}
                max={100}
                value={bonus !== 0 ? bonus : ""}
                onChange={(e) => setBonus(Number(e.currentTarget.value))}
                placeholder="0"
                disabled={isPending}
              />
            </div>
          </div>
        ) : (
          <div className="py-4">
            <Label htmlFor="name" className="text-sm font-medium">
              Nombre de {type === "subcategory" ? "subcategoría" : type === "brand" ? "marca" : "categoría"}
            </Label>
            <Input
              id="name"
              value={name}
              placeholder={type === "category" ? "Ej: Bebidas, Lácteos" : type === "subcategory" ? "Ej: Sin azúcar, Light" : "Ej: Coca-Cola, Pepsi"}
              onChange={(e) => setName(e.currentTarget.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              className="mt-1.5"
              disabled={isPending}
              autoFocus
            />
          </div>
        )}

        <DialogFooter className="sm:justify-center">
          <Button
            onClick={handleAdd}
            disabled={isPending || !name.trim()}
            className="w-full sm:w-auto bg-black dark:bg-white dark:text-gray-900"
          >
            {isPending ? "Guardando..." : `Crear ${type}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateAttributeModal;