"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createPublicOrder } from "@/actions/public-orders";
import { useContext, useState } from "react";
import { CartContext } from "./context/CartContext";

const checkoutSchema = z.object({
  dni: z.string().min(1, "El DNI es obligatorio"),
  name: z.string().min(1, "El nombre es obligatorio"),
  phone: z.string().optional(),
  email: z.string().email("Correo inválido").optional().or(z.literal('')),
  address: z.string().optional(),
}).refine((data) => data.phone || data.email, {
  message: "Debe proveer un teléfono o correo electrónico",
  path: ["phone"], // Marcará error en el field phone visualmente
});

type CheckoutFormValues = z.infer<typeof checkoutSchema>;

interface CheckoutFormProps {
  businessId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export function CheckoutForm({ businessId, onSuccess, onCancel }: CheckoutFormProps) {
  const { cartState, removeAll } = useContext(CartContext);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CheckoutFormValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      dni: "",
      name: "",
      phone: "",
      email: "",
      address: "",
    },
  });

  const onSubmit = async (data: CheckoutFormValues) => {
    if (cartState.products.length === 0) {
      toast.error("El carrito está vacío");
      return;
    }

    setIsSubmitting(true);

    try {
      const items = cartState.products.map(p => ({
        productId: p.id,
        code: p.code || undefined,
        description: p.description || undefined,
        price: p.salePrice || p.price || 0,
        quantity: p.amount || 1,
        subTotal: (p.salePrice || p.price || 0) * (p.amount || 1),
      }));

      const total = cartState.products.reduce(
        (acc, item) => acc + (item.salePrice || item.price || 0) * (item.amount || 1),
        0
      );

      const result = await createPublicOrder({
        businessId,
        client: {
          dni: data.dni,
          name: data.name,
          phone: data.phone,
          email: data.email,
          address: data.address,
        },
        items,
        total,
      });

      if (result.success) {
        toast.success("Pedido enviado con éxito");
        removeAll();
        onSuccess();
      } else {
        toast.error(result.error || "Hubo un error al crear el pedido");
      }
    } catch (error) {
      console.error(error);
      toast.error("Error al procesar el pedido");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-4">
      <div className="space-y-2">
        <Label htmlFor="dni">DNI / CUIL <span className="text-red-500">*</span></Label>
        <Input id="dni" placeholder="Ej: 12345678" {...register("dni")} />
        {errors.dni && <p className="text-sm text-red-500">{errors.dni.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="name">Nombre y Apellido <span className="text-red-500">*</span></Label>
        <Input id="name" placeholder="Ej: Juan Pérez" {...register("name")} />
        {errors.name && <p className="text-sm text-red-500">{errors.name.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Teléfono <span className="text-muted-foreground text-xs">(Opcional si provee email)</span></Label>
        <Input id="phone" placeholder="Ej: 1123456789" {...register("phone")} />
        {errors.phone && <p className="text-sm text-red-500">{errors.phone.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email <span className="text-muted-foreground text-xs">(Opcional si provee teléfono)</span></Label>
        <Input id="email" type="email" placeholder="Ej: juan@email.com" {...register("email")} />
        {errors.email && <p className="text-sm text-red-500">{errors.email.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="address">Dirección de Entrega <span className="text-muted-foreground text-xs">(Opcional)</span></Label>
        <Input id="address" placeholder="Ej: Calle Falsa 123" {...register("address")} />
        {errors.address && <p className="text-sm text-red-500">{errors.address.message}</p>}
      </div>

      <div className="flex gap-2 pt-4">
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Volver
        </Button>
        <Button
          type="submit"
          className="w-full"
          disabled={isSubmitting}
        >
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Confirmar Pedido
        </Button>
      </div>
    </form>
  );
}
