import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { getBusinessConfig } from "@/actions/business-config";
import { ConfigTabs } from "./ConfigTabs";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Settings } from "lucide-react";

export default async function AdminConfigPage() {
  const session = await auth();
  if (!session || session.user.role !== UserRole.ADMIN) redirect("/");

  const result = await getBusinessConfig();
  if (result.error || !result.success) {
    return <p className="text-destructive p-6">{result.error}</p>;
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-900 pb-20">
      <header className="p-4 md:p-6 border-b bg-white dark:bg-gray-900 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild title="Volver">
            <Link href="/admin">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <Settings className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight">Configuración</h1>
              <p className="text-sm text-gray-500 hidden sm:block">Ajustes generales del negocio</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <ConfigTabs initialData={result.success} />
      </div>
    </div>
  );
}
