"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useState, useTransition } from "react";
import { ArcaFieldsSchema } from "@/schemas";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormError } from "@/components/ui/form-error";
import { FormSuccess } from "@/components/ui/form-success";
import { updateBusinessArcaData } from "@/actions/arca";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ArcaFormProps {
  businessId: string;
  initialData?: z.infer<typeof ArcaFieldsSchema>;
}

export const ArcaForm = ({ businessId, initialData }: ArcaFormProps) => {
  const [error, setError] = useState<string | undefined>("");
  const [success, setSuccess] = useState<string | undefined>("");
  const [isPending, startTransition] = useTransition();

  const form = useForm<z.infer<typeof ArcaFieldsSchema>>({
    resolver: zodResolver(ArcaFieldsSchema),
    defaultValues: {
      cuit: initialData?.cuit || "",
      razonSocial: initialData?.razonSocial || "",
      inicioActividades: initialData?.inicioActividades ? new Date(initialData.inicioActividades) : undefined,
      condicionIva: initialData?.condicionIva || "MONOTRIBUTO",
      cert: "", // Don't show encrypted cert
      key: "",  // Don't show encrypted key
    },
  });

  const onSubmit = (values: z.infer<typeof ArcaFieldsSchema>) => {
    setError("");
    setSuccess("");

    startTransition(() => {
      updateBusinessArcaData(businessId, values)
        .then((data) => {
          if (data.error) {
            setError(data.error);
          }
          if (data.success) {
            setSuccess(data.success);
          }
        })
        .catch(() => setError("Algo salió mal"));
    });
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Configuración ARCA</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="cuit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CUIT</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        disabled={isPending}
                        placeholder="20-12345678-9"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="razonSocial"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Razón Social</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        disabled={isPending}
                        placeholder="Empresa S.A."
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="inicioActividades"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Inicio de Actividades</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        value={field.value ? new Date(field.value).toISOString().split('T')[0] : ''}
                        onChange={(e) => field.onChange(new Date(e.target.value))}
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="condicionIva"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Condición frente al IVA</FormLabel>
                    <Select
                      disabled={isPending}
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona una condición" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="MONOTRIBUTO">Monotributo</SelectItem>
                        <SelectItem value="RESPONSABLE_INSCRIPTO">
                          Responsable Inscripto
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="cert"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Certificado (CERT)</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      disabled={isPending}
                      placeholder="Pega el contenido del certificado aquí"
                      className="font-mono text-xs"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="key"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Llave Privada (KEY)</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      disabled={isPending}
                      placeholder="Pega el contenido de la llave privada aquí"
                      className="font-mono text-xs"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {error && <FormError message={error} />}
            {success && <FormSuccess message={success} />}

            <Button disabled={isPending} type="submit" className="w-full">
              {isPending ? "Guardando..." : "Guardar Configuración"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
};
