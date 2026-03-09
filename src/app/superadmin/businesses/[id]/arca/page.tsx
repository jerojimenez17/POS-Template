import { getBusinessArcaData } from "@/actions/arca";
import { ArcaForm } from "@/components/Superadmin/arca-form";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

interface ArcaPageProps {
  params: {
    id: string;
  };
}

export default async function ArcaPage({ params }: ArcaPageProps) {
  const { id } = params;
  const data = await getBusinessArcaData(id);

  if (data.error) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-4">
        <p className="text-destructive font-semibold">{data.error}</p>
        <Button asChild variant="outline">
          <Link href="/superadmin/businesses">
            <ChevronLeft className="w-4 h-4 mr-2" />
            Volver a Negocios
          </Link>
        </Button>
      </div>
    );
  }

  const initialData = data.success ? {
    cuit: data.success.cuit || "",
    razonSocial: data.success.razonSocial || "",
    inicioActividades: data.success.inicioActividades || undefined,
    condicionIva: data.success.condicionIva || "MONOTRIBUTO",
    cert: "",
    key: "",
  } : undefined;

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

      <ArcaForm businessId={id} initialData={initialData as any} />
    </div>
  );
}
