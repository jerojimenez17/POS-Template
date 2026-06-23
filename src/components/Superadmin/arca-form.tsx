"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useState, useTransition } from "react";
import { ArcaFieldsSchema } from "@/schemas";
import { CheckCircle2, XCircle, Plus, Trash2 } from "lucide-react";
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
import { Card, CardContent } from "@/components/ui/card";

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
      cert: "", 
      key: "",  
      ptoVenta: initialData?.ptoVenta || [],
    },
  });

  const [ptoVentaValues, setPtoVentaValues] = useState<number[]>(initialData?.ptoVenta || []);

  const addPtoVenta = () => {
    const newValues = [...ptoVentaValues, 1];
    setPtoVentaValues(newValues);
    form.setValue("ptoVenta", newValues);
  };

  const updatePtoVenta = (index: number, value: number) => {
    const newValues = [...ptoVentaValues];
    newValues[index] = value;
    setPtoVentaValues(newValues);
    form.setValue("ptoVenta", newValues);
  };

  const removePtoVenta = (index: number) => {
    const newValues = ptoVentaValues.filter((_, i) => i !== index);
    setPtoVentaValues(newValues);
    form.setValue("ptoVenta", newValues);
  };

  const hasCert = initialData?.cert === "CONFIGURADO" || initialData?.cert && initialData.cert.length > 0;
  const hasKey = initialData?.key === "CONFIGURADO" || initialData?.key && initialData.key.length > 0;

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
    <Card className="rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
      <CardContent className="p-6">
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

            <div className="space-y-4 border p-4 rounded-md">
              <div className="flex items-center justify-between">
                <FormLabel className="text-base font-semibold">Puntos de Venta</FormLabel>
                <Button type="button" variant="outline" size="sm" onClick={addPtoVenta} disabled={isPending}>
                  <Plus className="w-4 h-4 mr-2" /> Agregar Punto de Venta
                </Button>
              </div>
              
              {ptoVentaValues.length === 0 && (
                <p className="text-sm text-muted-foreground">No hay puntos de venta configurados.</p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {ptoVentaValues.map((pto, index) => (
                  <div key={index} className="flex items-center space-x-2">
                    <Input
                      type="number"
                      min="1"
                      value={pto}
                      onChange={(e) => updatePtoVenta(index, parseInt(e.target.value) || 1)}
                      disabled={isPending}
                      className="w-full"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      onClick={() => removePtoVenta(index)}
                      disabled={isPending}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Se guardarán los puntos de venta indicados arriba.
              </p>
            </div>
            <FormField
              control={form.control}
              name="cert"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel>Certificado (CERT)</FormLabel>
                    {hasCert && (
                      <span className="flex items-center text-xs font-medium text-green-600 bg-green-100 px-2 py-1 rounded-md">
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Configurado
                      </span>
                    )}
                    {!hasCert && (
                      <span className="flex items-center text-xs font-medium text-destructive bg-destructive/10 px-2 py-1 rounded-md">
                        <XCircle className="w-3 h-3 mr-1" /> Sin configurar
                      </span>
                    )}
                  </div>
                  <FormControl>
                    <Textarea
                      {...field}
                      disabled={isPending}
                      placeholder="Para actualizar el certificado, pega el nuevo contenido aquí. De lo contrario, déjalo vacío."
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
                  <div className="flex items-center justify-between">
                    <FormLabel>Llave Privada (KEY)</FormLabel>
                    {hasKey && (
                      <span className="flex items-center text-xs font-medium text-green-600 bg-green-100 px-2 py-1 rounded-md">
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Configurada
                      </span>
                    )}
                    {!hasKey && (
                      <span className="flex items-center text-xs font-medium text-destructive bg-destructive/10 px-2 py-1 rounded-md">
                        <XCircle className="w-3 h-3 mr-1" /> Sin configurar
                      </span>
                    )}
                  </div>
                  <FormControl>
                    <Textarea
                      {...field}
                      disabled={isPending}
                      placeholder="Para actualizar la llave privada, pega el nuevo contenido aquí. De lo contrario, déjalo vacío."
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
