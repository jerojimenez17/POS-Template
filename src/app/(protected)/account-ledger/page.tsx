import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BookOpen, ArrowLeft, Lock, MessageCircle } from "lucide-react";
import AccountLedgerContent from "./AccountLedgerContent";

export default async function AccountLedgerPage() {
  const session = await auth();

  if (!session?.user?.businessId) {
    redirect("/");
  }

  const hasClientLedger = session?.user?.business?.features?.hasClientLedger ?? false;

  if (!hasClientLedger) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-4">
        <div className="flex flex-col items-center text-center max-w-md gap-4">
          <div className="w-14 h-14 rounded-full bg-red-50 dark:bg-red-950/50 flex items-center justify-center">
            <Lock className="h-7 w-7 text-red-400 dark:text-red-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Funcionalidad no disponible
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
              La funcionalidad &quot;Cuenta Corriente&quot; no está incluida en
              tu plan actual.
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Contactanos vía WhatsApp para resolverlo.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full mt-2">
            <Link href="/" className="flex-1">
              <Button variant="outline" className="w-full rounded-lg flex items-center gap-2 justify-center">
                <ArrowLeft className="h-4 w-4" />
                Volver al inicio
              </Button>
            </Link>
            <a
              href="https://wa.me/5492265418113"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1"
            >
              <Button className="w-full rounded-lg bg-[#25D366] hover:bg-[#128C7E] text-white flex items-center gap-2 justify-center">
                <MessageCircle className="h-4 w-4" />
                Contactar por WhatsApp
              </Button>
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-900 pb-20">
      <header className="p-4 md:p-6 border-b bg-white dark:bg-gray-900 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild title="Volver">
            <Link href="/">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <BookOpen className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight">Cuenta Corriente</h1>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <AccountLedgerContent businessId={session.user.businessId} />
      </div>
    </div>
  );
}
