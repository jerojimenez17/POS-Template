import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { Lock, MessageCircle } from "lucide-react";
import { getBusinessArcaData } from "@/actions/arca";
import { requireFeature } from "@/lib/auth-gates";
import { ArcaForm } from "@/components/Superadmin/arca-form";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft, Settings } from "lucide-react";
import * as z from "zod";
import { ArcaFieldsSchema } from "@/schemas";
import { ArcaData } from "@/models/Arca";

/**
 * Static, server-rendered equivalent of <FeatureBlockedModal variant="feature" />.
 * The settings page is a Server Component, so it can't render the interactive
 * client modal — we mirror the messaging with a non-interactive blocked screen,
 * consistent with other gated admin surfaces.
 */
function FeatureBlockedScreen() {
  return (
    <div className="flex flex-col items-center text-center py-12 px-4 gap-4 max-w-md mx-auto">
      <div className="w-14 h-14 rounded-full bg-red-50 dark:bg-red-950/50 flex items-center justify-center">
        <Lock className="h-7 w-7 text-red-400 dark:text-red-400" />
      </div>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        Funcionalidad no disponible
      </h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
        La funcionalidad &quot;Facturación AFIP / ARCA&quot; no está incluida en tu plan actual.
      </p>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Contactanos vía WhatsApp para resolverlo.
      </p>
      <a
        href="https://wa.me/5492265418113"
        target="_blank"
        rel="noopener noreferrer"
        className="w-full"
      >
        <Button className="w-full rounded-lg bg-[#25D366] hover:bg-[#128C7E] text-white flex items-center gap-2 justify-center">
          <MessageCircle className="h-4 w-4" />
          Contactar por WhatsApp
        </Button>
      </a>
    </div>
  );
}

export default async function AdminSettingsPage() {
  const session = await auth();

  if (!session || session.user.role !== UserRole.ADMIN) {
    redirect("/");
  }

  const businessId = session.user.businessId;

  // FR-025: gate the entire page on the AFIP billing feature flag.
  const feature = await requireFeature("hasAfipBilling");
  if (!feature.success) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-gray-900">
        <header className="p-4 md:p-6 border-b bg-white dark:bg-gray-900 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild title="Volver">
              <Link href="/">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <Settings className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-bold tracking-tight">Configuración</h1>
                <p className="text-sm text-gray-500 hidden sm:block">ARCA / facturación electrónica</p>
              </div>
            </div>
          </div>
        </header>
        <div className="max-w-5xl mx-auto px-4 py-6">
          <FeatureBlockedScreen />
        </div>
      </div>
    );
  }

  const data: { success?: ArcaData; error?: string } = await getBusinessArcaData(businessId!);

  if (data.error || !data.success) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4">
          <p className="text-destructive font-semibold">{data.error || "Datos no encontrados"}</p>
          <Button asChild variant="outline">
            <Link href="/">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Volver
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const business = data.success;

  const initialData: z.infer<typeof ArcaFieldsSchema> = {
    cuit: business.cuit || "",
    razonSocial: business.razonSocial || "",
    inicioActividades: business.inicioActividades ? new Date(business.inicioActividades) : new Date(),
    condicionIva: business.condicionIva as "MONOTRIBUTO" | "RESPONSABLE_INSCRIPTO",
    cert: business.cert ? "CONFIGURADO" : "",
    key: business.key ? "CONFIGURADO" : "",
    ptoVenta: business.ptoVenta || [],
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-900">
      <header className="p-4 md:p-6 border-b bg-white dark:bg-gray-900 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild title="Volver">
            <Link href="/">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <Settings className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight">Configuración</h1>
              <p className="text-sm text-gray-500 hidden sm:block">ARCA / facturación electrónica</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6">
        <ArcaForm businessId={businessId || ""} initialData={initialData} />
      </div>
    </div>
  );
}