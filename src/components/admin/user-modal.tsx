"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { BusinessUserSchema } from "@/schemas";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createBusinessUser, updateBusinessUser } from "@/components/actions/users";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface UserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user?: any | null;
}

export const UserModal = ({ isOpen, onClose, user }: UserModalProps) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const isEditing = !!user;

  const form = useForm<z.infer<typeof BusinessUserSchema>>({
    resolver: zodResolver(BusinessUserSchema),
    defaultValues: {
      name: user?.name || "",
      email: user?.email || "",
      password: "", // Always empty by default
      role: user?.role || "USER",
    },
  });

  // Effect to reset form when user prop changes
  useState(() => {
     if (user) {
         form.reset({
             name: user.name || "",
             email: user.email || "",
             password: "",
             role: user.role || "USER",
         })
     } else {
         form.reset({
             name: "",
             email: "",
             password: "",
             role: "USER"
         })
     }
  });


  const onSubmit = (values: z.infer<typeof BusinessUserSchema>) => {
    startTransition(() => {
      if (isEditing) {
        updateBusinessUser(user.id, values).then((data) => {
          if (data.error) {
            toast.error(data.error);
          } else {
            toast.success(data.success);
            onClose();
            router.refresh();
          }
        });
      } else {
        createBusinessUser(values).then((data) => {
          if (data.error) {
            toast.error(data.error);
          } else {
            toast.success(data.success);
            onClose();
            router.refresh();
          }
        });
      }
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
        if (!open) {
             onClose();
             form.reset();
        }
    }}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Vendedor" : "Agregar Vendedor"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Modifica los detalles del vendedor."
              : "Agrega un nuevo vendedor a tu negocio."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre completo</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={isPending} placeholder="Juan Pérez" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input {...field} type="email" disabled={isPending} placeholder="juan@ejemplo.com" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contraseña {isEditing && "(Opcional)"}</FormLabel>
                  <FormControl>
                    <Input {...field} type="password" disabled={isPending} placeholder="******" />
                  </FormControl>
                  <FormDescription>
                    {isEditing ? "Déjalo en blanco para mantener la contraseña actual." : "Debe tener al menos 6 caracteres."}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Rol</FormLabel>
                  <Select
                    disabled={isPending}
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona un rol" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="USER">Vendedor</SelectItem>
                      <SelectItem value="ADMIN">Administrador</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" disabled={isPending} onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isEditing ? "Guardar cambios" : "Crear vendedor"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
