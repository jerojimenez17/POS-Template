import { getBusinessArcaData } from "@/actions/arca";
import { ArcaForm } from "@/components/Superadmin/arca-form";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { ArcaFieldsSchema } from "@/schemas";
import { ArcaData } from "@/models/Arca";
import * as z from "zod";

interface ArcaPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function ArcaPage({ params }: ArcaPageProps) {
  const { id } = await params;
  const data: { success?: ArcaData; error?: string } = await getBusinessArcaData(id);

  if (data.error || !data.success) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-4">
        <p className="text-destructive font-semibold">{data.error || "Datos no encontrados"}</p>
        <Button asChild variant="outline">
          <Link href="/superadmin/businesses">
            <ChevronLeft className="w-4 h-4 mr-2" />
            Volver a Negocios
          </Link>
        </Button>
      </div>
    );
  }

  const business = data.success;

  // Ensure data matches the schema type for the form
  const initialData: z.infer<typeof ArcaFieldsSchema> = {
    cuit: business.cuit || "",
    razonSocial: business.razonSocial || "",
    inicioActividades: business.inicioActividades ? new Date(business.inicioActividades) : new Date(),
    condicionIva: business.condicionIva as "MONOTRIBUTO" | "RESPONSABLE_INSCRIPTO",
    cert: "",
    key: "",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/superadmin/businesses">
            <ChevronLeft className="w-4 h-4 mr-2" />
            Volver
          </Link>
        </Button>
        <h1 className="text-3xl font-bold">Gestión de ARCA</h1>
      </div>

      <ArcaForm businessId={id} initialData={initialData} />
    </div>
  );
}
