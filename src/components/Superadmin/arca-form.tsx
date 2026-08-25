"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useState, useTransition } from "react";
import { ArcaFieldsSchema } from "@/schemas";
import { CheckCircle2, XCircle, Plus, Trash2, Shield, ShieldCheck, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { generateCertsAction } from "@/actions/generate-certs";
import { Card, CardContent } from "@/components/ui/card";
import { FeatureBlockedModal } from "@/components/ui/feature-blocked-modal";
import { parsePlanError } from "@/lib/plan-error";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";

interface ArcaFormProps {
  businessId: string;
  initialData?: z.infer<typeof ArcaFieldsSchema>;
}

export const ArcaForm = ({ businessId, initialData }: ArcaFormProps) => {
  const [error, setError] = useState<string | undefined>("");
  const [success, setSuccess] = useState<string | undefined>("");
  const [isPending, startTransition] = useTransition();
  const [planError, setPlanError] = useState<ReturnType<typeof parsePlanError> | null>(null);

  // Cert generation dialog state
  const [showGenDialog, setShowGenDialog] = useState(false);
  const [genMode, setGenMode] = useState<"dev" | "prod">("dev");
  const [genCuit, setGenCuit] = useState("");
  const [genUsername, setGenUsername] = useState("");
  const [genPassword, setGenPassword] = useState("");
  const [genAlias, setGenAlias] = useState("afipsdk");
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState<string | undefined>("");

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

  // Delete confirmation state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [ptoVentaToRemove, setPtoVentaToRemove] = useState<number | null>(null);

  const addPtoVenta = () => {
    const maxPto = ptoVentaValues.length > 0 ? Math.max(...ptoVentaValues) : 0;
    const newValue = maxPto + 1;
    const newValues = [...ptoVentaValues, newValue];
    setPtoVentaValues(newValues);
    form.setValue("ptoVenta", newValues);
  };

  const updatePtoVenta = (index: number, value: number) => {
    const newValues = [...ptoVentaValues];
    newValues[index] = value;
    setPtoVentaValues(newValues);
    form.setValue("ptoVenta", newValues);
  };

  const confirmRemovePtoVenta = (index: number) => {
    setPtoVentaToRemove(index);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmRemove = () => {
    if (ptoVentaToRemove === null) return;
    const newValues = ptoVentaValues.filter((_, i) => i !== ptoVentaToRemove);
    setPtoVentaValues(newValues);
    form.setValue("ptoVenta", newValues);
    setPtoVentaToRemove(null);
    setDeleteConfirmOpen(false);
  };

  const hasCert = initialData?.cert === "CONFIGURADO" || initialData?.cert && initialData.cert.length > 0;
  const hasKey = initialData?.key === "CONFIGURADO" || initialData?.key && initialData.key.length > 0;

  const openGenerateDialog = (mode: "dev" | "prod") => {
    const currentCuit = form.getValues().cuit || initialData?.cuit || "";
    setGenMode(mode);
    setGenCuit(currentCuit);
    setGenUsername(currentCuit);
    setGenPassword("");
    setGenAlias("afipsdk");
    setGenError("");
    setShowGenDialog(true);
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setGenError("");
    setError("");
    setSuccess("");

    try {
      const result = await generateCertsAction(
        genMode,
        genCuit,
        genUsername,
        genPassword,
        genAlias,
        businessId
      );

      if (result.error) {
        setGenError(result.error);
        return;
      }

      if (result.success) {
        setShowGenDialog(false);
        setSuccess(result.success);
      }
    } catch {
      setGenError("Error inesperado al generar certificados");
    } finally {
      setIsGenerating(false);
    }
  };

  const onSubmit = (values: z.infer<typeof ArcaFieldsSchema>) => {
    setError("");
    setSuccess("");
    setPlanError(null);

    startTransition(() => {
      updateBusinessArcaData(businessId, values)
        .then((data) => {
          if (data.error) {
            const parsed = parsePlanError(data.error);
            if (parsed.isPlanError) {
              setPlanError(parsed);
            } else {
              setError(data.error);
            }
          }
          if (data.success) {
            setSuccess(data.success);
          }
        })
        .catch(() => setError("Algo salió mal"));
    });
  };

  return (
    <>
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
                      onClick={() => confirmRemovePtoVenta(index)}
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
            {/* Cert Generator Section */}
            <div className="border p-4 rounded-md space-y-3">
              <div className="flex items-center justify-between">
                <FormLabel className="text-base font-semibold">
                  Generar Certificados ARCA
                </FormLabel>
              </div>
              <p className="text-sm text-muted-foreground">
                Genere automáticamente certificados desde AFIP/ARCA usando sus
                credenciales de acceso web.
              </p>
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => openGenerateDialog("dev")}
                  disabled={isPending}
                  className="flex-1"
                >
                  <Shield className="w-4 h-4 mr-2" />
                  Generar DEV
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => openGenerateDialog("prod")}
                  disabled={isPending}
                  className="flex-1"
                >
                  <ShieldCheck className="w-4 h-4 mr-2" />
                  Generar PROD
                </Button>
              </div>
            </div>

            {error && <FormError message={error} />}
            {success && <FormSuccess message={success} />}

            <Button disabled={isPending} type="submit" className="w-full">
              {isPending ? "Guardando..." : "Guardar Configuración"}
            </Button>
          </form>
        </Form>

        <FeatureBlockedModal
          open={!!planError}
          onOpenChange={(open) => { if (!open) setPlanError(null); }}
          variant={planError?.variant ?? "feature"}
          feature={planError?.feature}
          resource={planError?.resource}
          limitValue={planError?.limitValue}
        />

        <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar punto de venta?</AlertDialogTitle>
              <AlertDialogDescription>
                Vas a eliminar el punto de venta <strong>N° {ptoVentaToRemove !== null ? ptoVentaValues[ptoVentaToRemove] : ""}</strong>.
                Los cambios se guardarán cuando envíes el formulario.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => { e.preventDefault(); handleConfirmRemove(); }}
                disabled={isPending}
                className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
              >
                {isPending ? "Eliminando..." : "Sí, eliminar"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>

    {/* Generate Certificates Dialog */}
      <Dialog open={showGenDialog} onOpenChange={setShowGenDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Generar Certificados{" "}
              {genMode === "dev" ? "de Prueba (DEV)" : "de Producción (PROD)"}
            </DialogTitle>
            <DialogDescription>
              Ingrese las credenciales de acceso web de AFIP/ARCA para generar
              los certificados. Sus datos no se almacenan, solo se envían a la
              Cloud Function para la generación.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">CUIT</label>
              <Input
                value={genCuit}
                onChange={(e) => setGenCuit(e.target.value)}
                placeholder="20111111112"
                disabled={isGenerating}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Usuario</label>
              <Input
                value={genUsername}
                onChange={(e) => setGenUsername(e.target.value)}
                placeholder="20111111112"
                disabled={isGenerating}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Contraseña</label>
              <Input
                type="password"
                value={genPassword}
                onChange={(e) => setGenPassword(e.target.value)}
                placeholder="contraseña"
                disabled={isGenerating}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Alias</label>
              <Input
                value={genAlias}
                onChange={(e) => setGenAlias(e.target.value)}
                placeholder="afipsdk"
                disabled={isGenerating}
              />
              <p className="text-xs text-muted-foreground">
                El alias del servicio (por defecto: afipsdk)
              </p>
            </div>
            {genError && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md border border-destructive/20">
                {genError}
              </div>
            )}
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button
                type="button"
                variant="outline"
                disabled={isGenerating}
              >
                Cancelar
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating || !genCuit || !genUsername || !genPassword}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generando...
                </>
              ) : (
                "Generar Certificados"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
