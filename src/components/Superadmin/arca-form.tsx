"use client";

import { useForm, useWatch, FormProvider, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useEffect, useState, useTransition, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { ArcaFieldsSchema } from "@/schemas";
import { CheckCircle2, XCircle, Plus, Trash2, Shield, Loader2 } from "lucide-react";
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

type GeneratorInputProps = ComponentProps<typeof Input> & {
  label: string;
  help?: string;
};

const CertificateStepField = ({ control, name, label, configured, disabled }: CertificateFieldProps) => {
  const [replace, setReplace] = useState(false);
  const showConfigured = configured && !replace;
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={`space-y-3 rounded-xl border p-4 transition-colors ${showConfigured ? "border-emerald-500/40 bg-emerald-500/10" : "border-border/70 bg-muted/10"}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <FormLabel>{label}</FormLabel>
            <span
              className={showConfigured
                ? "inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300"
                : "inline-flex items-center gap-1 rounded-full border border-destructive/20 bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive"}
            >
              {showConfigured ? <CheckCircle2 aria-hidden="true" className="h-3 w-3" /> : <XCircle aria-hidden="true" className="h-3 w-3" />}
              {showConfigured ? "Configurado" : "Sin configurar"}
            </span>
          </div>

          {showConfigured ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-emerald-700/80 dark:text-emerald-300/80">Ya hay un valor guardado. No se muestra por seguridad.</p>
              <Button type="button" variant="outline" size="sm" onClick={() => setReplace(true)} disabled={disabled}>
                Reemplazar
              </Button>
            </div>
          ) : (
            <>
              <div className="grid gap-2">
                <label htmlFor={`${name}-file`} className="text-xs font-medium text-foreground">Cargar archivo</label>
                <Input
                  id={`${name}-file`}
                  type="file"
                  accept=".pem,.crt,.cer,.key,.txt"
                  disabled={disabled}
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (file) field.onChange(await file.text());
                  }}
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor={`${name}-paste`} className="text-xs font-medium text-foreground">O pegar el texto</label>
                <FormControl>
                  <Textarea
                    {...field}
                    id={`${name}-paste`}
                    disabled={disabled}
                    placeholder={`Pegá el contenido de ${label}…`}
                    className="min-h-24 font-mono text-xs"
                  />
                </FormControl>
              </div>
            </>
          )}
          <FormMessage />
        </FormItem>
      )}
    />
  );
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
  const [genStep, setGenStep] = useState<1 | 2 | 3 | 4>(1);
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
    form.setValue("ptoVenta", newValues, { shouldDirty: true });
  };

  const updatePtoVenta = (index: number, value: number) => {
    const newValues = [...ptoVentaValues];
    newValues[index] = value;
    setPtoVentaValues(newValues);
    form.setValue("ptoVenta", newValues, { shouldDirty: true });
  };

  const confirmRemovePtoVenta = (index: number) => {
    setPtoVentaToRemove(index);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmRemove = () => {
    if (ptoVentaToRemove === null) return;
    const newValues = ptoVentaValues.filter((_, i) => i !== ptoVentaToRemove);
    setPtoVentaValues(newValues);
    form.setValue("ptoVenta", newValues, { shouldDirty: true });
    setPtoVentaToRemove(null);
    setDeleteConfirmOpen(false);
  };

  const hasCert = initialData?.cert === "CONFIGURADO" || initialData?.cert && initialData.cert.length > 0;
  const hasKey = initialData?.key === "CONFIGURADO" || initialData?.key && initialData.key.length > 0;
  const hasExistingCertificates = Boolean(hasCert || hasKey);
  const genModeLabel = genMode === "dev" ? "TEST" : "PROD";

  const certInputValue = useWatch({ control: form.control, name: "cert" });
  const keyInputValue = useWatch({ control: form.control, name: "key" });
  const certInputsPending = Boolean(certInputValue?.trim() || keyInputValue?.trim());
  const hasManualCert = Boolean(certInputValue?.trim());
  const hasManualKey = Boolean(keyInputValue?.trim());
  const hasCredentials = Boolean(genCuit.trim() && genUsername.trim() && genPassword.trim() && genAlias.trim());
  const canFinalize = (hasManualCert && hasManualKey) || hasCredentials;
  const genDialogPending = showGenDialog && (genStep > 1 || Boolean(genCuit.trim() || genUsername.trim() || genPassword.trim()));
  const hasUnsavedChanges = form.formState.isDirty || certInputsPending || genDialogPending;

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("arca-settings-dirty", { detail: hasUnsavedChanges }));
  }, [hasUnsavedChanges]);

  const openGenerateDialog = () => {
    const currentCuit = form.getValues().cuit || initialData?.cuit || "";
    setGenMode("dev");
    setGenStep(1);
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
        setGenStep(1);
        setSuccess(result.success);
        router.refresh();
      }
    } catch {
      setGenError("Error inesperado al generar certificados");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveCertificates = async () => {
    setIsGenerating(true);
    setGenError("");
    try {
      const values = form.getValues();
      const data = await updateBusinessArcaData(businessId, values);
      if (data.error) {
        setGenError(data.error);
        return;
      }
      setShowGenDialog(false);
      setGenStep(1);
      setSuccess(data.success);
      form.reset({ ...values, cert: "", key: "" });
      router.refresh();
    } catch {
      setGenError("Error inesperado al guardar los certificados");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFinalize = () => {
    if (hasManualCert && hasManualKey) return handleSaveCertificates();
    return handleGenerate();
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
            form.reset({ ...values, cert: "", key: "" });
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
            {/* Cert Generator Section */}
            <section aria-labelledby="certificate-generation-title" className="space-y-4 rounded-lg border border-primary/20 bg-primary/[0.03] p-4 dark:bg-primary/[0.06]">
              <div className="flex items-center justify-between">
                <h2 id="certificate-generation-title" className="text-base font-semibold text-foreground">
                  Certificados ARCA
                </h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Generá certificados desde ARCA con tus credenciales o cargá tu CERT y KEY existentes.
              </p>
              <ol className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4" aria-label="Pasos para configurar certificados">
                <li className="rounded-md border border-border/60 bg-background/70 p-2"><span className="font-semibold text-foreground">1.</span> Elegí el entorno</li>
                <li className="rounded-md border border-border/60 bg-background/70 p-2"><span className="font-semibold text-foreground">2.</span> Ingresá tus credenciales</li>
                <li className="rounded-md border border-border/60 bg-background/70 p-2"><span className="font-semibold text-foreground">3.</span> Cargá CERT y KEY</li>
                <li className="rounded-md border border-border/60 bg-background/70 p-2"><span className="font-semibold text-foreground">4.</span> Confirmá</li>
              </ol>
              {hasExistingCertificates && (
                <p role="status" className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-300">
                  Ya hay certificados cargados. Si generás o cargás nuevos, se reemplazarán los actuales.
                </p>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => openGenerateDialog()}
                disabled={isPending}
                className="w-full gap-2"
              >
                <Shield aria-hidden="true" className="w-4 h-4" />
                {hasExistingCertificates ? "Reemplazar Certificados" : "Generar Certificados"}
              </Button>
            </section>

            {error && <div role="alert" aria-live="polite"><FormError message={error} /></div>}
            {success && <div role="status" aria-live="polite"><FormSuccess message={success} /></div>}

            <Button disabled={isPending} type="submit" className="mx-auto flex w-full items-center justify-center sm:w-auto sm:min-w-[220px]">
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

    {/* Generate Certificates Dialog — 4-step wizard */}
    <Dialog
      open={showGenDialog}
      onOpenChange={(next) => {
        setShowGenDialog(next);
        if (!next) setGenStep(1);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto overscroll-contain sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Generar Certificados ARCA</DialogTitle>
          <DialogDescription>
            Elegí el entorno, ingresá tus credenciales de acceso web y generá los certificados. No se muestran ni se guardan certificados o claves en este formulario.
          </DialogDescription>
        </DialogHeader>

        <ol className="flex items-center gap-2" aria-label="Progreso de generación de certificados">
          {[1, 2, 3, 4].map((step) => {
            const labels = ["Entorno", "Credenciales", "Certificado", "Confirmar"];
            const active = genStep === step;
            const completed = genStep > step;
            return (
              <li key={step} className="flex flex-1 items-center gap-2">
                <span
                  aria-current={active ? "step" : undefined}
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : completed
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border bg-muted text-muted-foreground"
                  }`}
                >
                  {completed ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : step}
                </span>
                <span className={`truncate text-xs ${active ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{labels[step - 1]}</span>
                {step < 4 && <span className="hidden h-px flex-1 bg-border sm:block" aria-hidden="true" />}
              </li>
            );
          })}
        </ol>

        {genStep === 1 && (
          <div className="space-y-3 py-1">
            <p className="text-sm text-muted-foreground">¿En qué entorno querés generar los certificados?</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setGenMode("dev")}
                aria-pressed={genMode === "dev"}
                className={`rounded-xl border p-4 text-left transition-colors ${genMode === "dev" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/50"}`}
              >
                <div className="flex items-center gap-2 font-semibold"><Shield className="h-4 w-4" aria-hidden="true" /> TEST</div>
                <p className="mt-1 text-xs text-muted-foreground">Pruebas / homologación. No emite comprobantes fiscales reales.</p>
              </button>
              <button
                type="button"
                onClick={() => setGenMode("prod")}
                aria-pressed={genMode === "prod"}
                className={`rounded-xl border p-4 text-left transition-colors ${genMode === "prod" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/50"}`}
              >
                <div className="flex items-center gap-2 font-semibold"><Shield className="h-4 w-4" aria-hidden="true" /> PROD</div>
                <p className="mt-1 text-xs text-muted-foreground">Producción. Los comprobantes emitidos son fiscales.</p>
              </button>
            </div>
            {hasExistingCertificates && (
              <p role="alert" className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-300">
                Ya hay certificados cargados ({hasCert ? "CERT" : ""}{hasCert && hasKey ? " y " : ""}{hasKey ? "KEY" : ""}). Al generar, se reemplazarán los actuales.
              </p>
            )}
          </div>
        )}

        {genStep === 2 && (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              Entorno seleccionado: <span className="font-semibold text-foreground">{genModeLabel}</span>
            </div>
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
        )}

        {genStep === 3 && (
          <FormProvider {...form}>
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">Cargá el certificado y la clave privada. Podés subir el archivo o pegar el texto.</p>
              <CertificateStepField control={form.control} name="cert" label="Certificado (CERT)" configured={!!hasCert} disabled={isGenerating} />
              <CertificateStepField control={form.control} name="key" label="Llave Privada (KEY)" configured={!!hasKey} disabled={isGenerating} />
              <p className="text-xs text-muted-foreground">Si ya están configurados, podés continuar sin reemplazarlos o tocar “Reemplazar”.</p>
            </div>
          </FormProvider>
        )}

        {genStep === 4 && (
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">Revisá los datos antes de continuar.</p>
            <dl className="grid gap-2 rounded-lg border border-border/60 bg-muted/30 p-3 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Entorno</dt><dd className="font-semibold">{genModeLabel}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">CUIT</dt><dd className="font-mono">{genCuit}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Usuario</dt><dd className="font-mono">{genUsername}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Alias</dt><dd className="font-mono">{genAlias}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Certificado</dt><dd className="font-medium">{hasManualCert && hasManualKey ? "Se guardará el cargado" : hasCert ? "Configurado" : "Se generará con ARCA"}</dd></div>
            </dl>
            {hasExistingCertificates && (
              <p role="alert" className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-300">
                Se reemplazarán los certificados actuales del negocio.
              </p>
            )}
            {genError && (
              <div role="alert" aria-live="polite" className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                {genError}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            {genStep > 1 && (
              <Button type="button" variant="ghost" onClick={() => setGenStep(genStep === 4 ? 3 : genStep === 3 ? 2 : 1)} disabled={isGenerating}>
                Atrás
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => { setShowGenDialog(false); setGenStep(1); }}
              disabled={isGenerating}
            >
              Cancelar
            </Button>
            {genStep < 4 ? (
              <Button
                type="button"
                onClick={() => setGenStep(genStep === 1 ? 2 : genStep === 2 ? 3 : 4)}
              >
                Siguiente
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleFinalize}
                disabled={isGenerating || !canFinalize}
              >
                {isGenerating ? (
                  <>
                    <Loader2 aria-hidden="true" className="w-4 h-4 mr-2 animate-spin" />
                    Procesando…
                  </>
                ) : hasExistingCertificates ? (
                  "Reemplazar Certificados"
                ) : (
                  "Generar Certificados"
                )}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
};
