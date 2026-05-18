import { getBusinessArcaData } from "@/actions/arca";
import { ArcaForm } from "@/components/Superadmin/arca-form";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { auth } from "../../../../auth";
import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import * as z from "zod";
import { ArcaFieldsSchema } from "@/schemas";
import { ArcaData } from "@/models/Arca";

export default async function AdminSettingsPage() {
  const session = await auth();

  if (!session || session.user.role !== UserRole.ADMIN) {
    redirect("/");
  }

  const businessId = session.user.businessId;
  const data: { success?: ArcaData; error?: string } = await getBusinessArcaData(businessId!);

  if (data.error || !data.success) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-4">
        <p className="text-destructive font-semibold">{data.error || "Datos no encontrados"}</p>
        <Button asChild variant="outline">
          <Link href="/">
            <ChevronLeft className="w-4 h-4 mr-2" />
            Volver
          </Link>
        </Button>
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
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center space-x-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/">
            <ChevronLeft className="w-4 h-4 mr-2" />
            Volver
          </Link>
        </Button>
        <h1 className="text-3xl font-bold">Configuración de Negocio (ARCA)</h1>
      </div>

      <ArcaForm businessId={businessId || ""} initialData={initialData} />
    </div>
  );
}
