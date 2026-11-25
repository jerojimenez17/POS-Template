"use client";

import { useForm, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useState, useTransition, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

type ArcaFormValues = z.infer<typeof ArcaFieldsSchema>;
type CertificateFieldName = "cert" | "key";

interface CertificateFieldProps {
  control: Control<ArcaFormValues>;
  name: CertificateFieldName;
  label: string;
  configured: boolean;
  disabled: boolean;
}

const CertificateField = ({ control, name, label, configured, disabled }: CertificateFieldProps) => (
  <FormField
    control={control}
    name={name}
    render={({ field }) => (
      <FormItem className="space-y-2 rounded-lg border border-border/70 bg-muted/10 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <FormLabel>{label}</FormLabel>
          <span
            className={configured
              ? "inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300"
              : "inline-flex items-center gap-1 rounded-full border border-destructive/20 bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive"}
          >
            {configured ? <CheckCircle2 aria-hidden="true" className="h-3 w-3" /> : <XCircle aria-hidden="true" className="h-3 w-3" />}
            {configured ? "Configurado" : "Sin configurar"}
          </span>
        </div>
        <FormControl>
          <Textarea
            {...field}
            disabled={disabled}
            aria-describedby={`${name}-help`}
            placeholder={`Para actualizar ${label}, pegá el nuevo contenido aquí. De lo contrario, dejalo vacío.`}
            className="min-h-24 font-mono text-xs"
          />
        </FormControl>
        <p id={`${name}-help`} className="text-xs text-muted-foreground">
          {configured ? "Ya hay un valor guardado. Un campo vacío conserva la configuración actual." : "Podés pegar el contenido PEM para configurarlo. Nunca se muestra el valor guardado."}
        </p>
        <FormMessage />
      </FormItem>
    )}
  />
);

type GeneratorInputProps = ComponentProps<typeof Input> & {
  label: string;
  help?: string;
};

const GeneratorInput = ({ id, label, help, ...props }: GeneratorInputProps) => (
  <div className="space-y-2">
    <label htmlFor={id} className="text-sm font-medium text-foreground">{label}</label>
    <Input id={id} name={id} {...props} />
    {help && <p className="text-xs text-muted-foreground">{help}</p>}
  </div>
);

export const ArcaForm = ({ businessId, initialData }: ArcaFormProps) => {
  const router = useRouter();
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

  const form = useForm<ArcaFormValues>({
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
        router.refresh();
      }
    } catch {
      setGenError("Error inesperado al generar certificados");
    } finally {
      setIsGenerating(false);
    }
  };

  const onSubmit = (values: ArcaFormValues) => {
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
    <Card className="border-border/70 bg-card shadow-sm">
      <CardHeader className="border-b border-border/60 pb-5">
        <CardTitle className="text-xl text-foreground">Configuración ARCA</CardTitle>
        <CardDescription>
          Completá los datos fiscales y configurá los certificados sin exponer su contenido.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 sm:p-6">
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

            <section aria-labelledby="sales-points-title" className="space-y-4 rounded-lg border border-border/70 bg-muted/20 p-4">
              <div className="flex items-center justify-between">
                <h2 id="sales-points-title" className="text-base font-semibold text-foreground">Puntos de Venta</h2>
                <Button type="button" variant="outline" size="sm" onClick={addPtoVenta} disabled={isPending} className="shrink-0">
                  <Plus className="w-4 h-4 mr-2" /> Agregar Punto de Venta
                </Button>
              </div>
              
              {ptoVentaValues.length === 0 && (
                <p className="text-sm text-muted-foreground">No hay puntos de venta configurados.</p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {ptoVentaValues.map((pto, index) => (
                  <div key={index} className="flex items-center space-x-2">
                    <label className="flex min-w-0 flex-1 items-center gap-2" htmlFor={`pto-venta-${index}`}>
                      <span className="sr-only">Número del punto de venta {index + 1}</span>
                      <Input
                        id={`pto-venta-${index}`}
                      type="number"
                      min="1"
                      value={pto}
                      onChange={(e) => updatePtoVenta(index, parseInt(e.target.value) || 1)}
                      disabled={isPending}
                        className="w-full"
                      />
                    </label>
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      onClick={() => confirmRemovePtoVenta(index)}
                      disabled={isPending}
                      aria-label={`Eliminar punto de venta ${pto}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Se guardarán los puntos de venta indicados arriba.
              </p>
            </section>
            <div className="grid gap-4 lg:grid-cols-2">
              <CertificateField control={form.control} name="cert" label="Certificado (CERT)" configured={!!hasCert} disabled={isPending} />
              <CertificateField control={form.control} name="key" label="Llave Privada (KEY)" configured={!!hasKey} disabled={isPending} />
            </div>
            {/* Cert Generator Section */}
            <section aria-labelledby="certificate-generation-title" className="space-y-4 rounded-lg border border-primary/20 bg-primary/[0.03] p-4 dark:bg-primary/[0.06]">
              <div className="flex items-center justify-between">
                <h2 id="certificate-generation-title" className="text-base font-semibold text-foreground">
                  Generar Certificados ARCA
                </h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Generá certificados DEV o PROD desde ARCA usando tus credenciales de acceso web.
              </p>
              <ol className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3" aria-label="Pasos para generar certificados">
                <li className="rounded-md border border-border/60 bg-background/70 p-2"><span className="font-semibold text-foreground">1.</span> Elegí el entorno</li>
                <li className="rounded-md border border-border/60 bg-background/70 p-2"><span className="font-semibold text-foreground">2.</span> Ingresá tus credenciales</li>
                <li className="rounded-md border border-border/60 bg-background/70 p-2"><span className="font-semibold text-foreground">3.</span> Generá y verificá el estado</li>
              </ol>
              <div className="grid gap-3 sm:grid-cols-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => openGenerateDialog("dev")}
                  disabled={isPending}
                  className="flex-1"
                >
                  <Shield aria-hidden="true" className="w-4 h-4 mr-2" />
                  Generar DEV
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => openGenerateDialog("prod")}
                  disabled={isPending}
                  className="flex-1"
                >
                  <ShieldCheck aria-hidden="true" className="w-4 h-4 mr-2" />
                  Generar PROD
                </Button>
              </div>
            </section>

            {error && <div role="alert" aria-live="polite"><FormError message={error} /></div>}
            {success && <div role="status" aria-live="polite"><FormSuccess message={success} /></div>}

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
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 focus:ring-destructive"
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
          <DialogContent className="max-h-[90vh] overflow-y-auto overscroll-contain sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Generar Certificados{" "}
              {genMode === "dev" ? "de Prueba (DEV)" : "de Producción (PROD)"}
            </DialogTitle>
            <DialogDescription>
              Paso 2 de 3 · Ingresá las credenciales de acceso web de ARCA para generar los certificados {genMode === "dev" ? "de prueba" : "de producción"}. No se muestran ni se guardan certificados o claves en este formulario.
            </DialogDescription>
          </DialogHeader>

           <div className="space-y-4 py-2">
             <GeneratorInput
                id="gen-cuit"
                label="CUIT"
                value={genCuit}
                onChange={(e) => setGenCuit(e.target.value)}
                placeholder="20111111112…"
                autoComplete="off"
                disabled={isGenerating}
              />
             <GeneratorInput
                id="gen-username"
                label="Usuario"
                value={genUsername}
                onChange={(e) => setGenUsername(e.target.value)}
                placeholder="20111111112…"
                autoComplete="username"
                spellCheck={false}
                disabled={isGenerating}
              />
             <GeneratorInput
                id="gen-password"
                label="Contraseña"
                type="password"
                value={genPassword}
                onChange={(e) => setGenPassword(e.target.value)}
                placeholder="Ingresá tu contraseña…"
                autoComplete="current-password"
                disabled={isGenerating}
              />
             <GeneratorInput
                id="gen-alias"
                label="Alias"
                value={genAlias}
                onChange={(e) => setGenAlias(e.target.value)}
                placeholder="afipsdk…"
                autoComplete="off"
                spellCheck={false}
                disabled={isGenerating}
                help="Alias del servicio (por defecto: afipsdk)."
              />
            {genError && (
              <div role="alert" aria-live="polite" className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
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
              disabled={isGenerating || !genCuit.trim() || !genUsername.trim() || !genPassword.trim() || !genAlias.trim()}
            >
              {isGenerating ? (
                <>
                  <Loader2 aria-hidden="true" className="w-4 h-4 mr-2 animate-spin" />
                  Generando…
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
