import { auth } from "@/../auth";
import { getSaleByIdAction } from "@/actions/sales";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import BillProvider from "@/context/BillProvider";
import EditSaleWrapper from "./EditSaleWrapper";
import { Suspense } from "react";
import Spinner from "@/components/ui/Spinner";

export default async function EditSalePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] space-y-4">
        <h2 className="text-2xl font-bold text-red-500">Acceso Denegado</h2>
        <p>Solo los administradores pueden editar ventas.</p>
        <Link href={`/sales/${id}`} className="text-blue-500 hover:underline flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Volver a la venta
        </Link>
      </div>
    );
  }

  const sale = await getSaleByIdAction(id);

  if (!sale) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] space-y-4">
        <h2 className="text-2xl font-bold">Venta no encontrada</h2>
        <Link href="/searchBill" className="text-blue-500 hover:underline flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Volver a ventas
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 md:py-8 max-w-7xl h-full flex flex-col">
      <Link href={`/sales/${id}`} className="text-slate-500 hover:text-slate-700 flex items-center gap-1 transition-colors w-fit mb-4 text-sm font-medium">
        <ArrowLeft className="h-4 w-4" /> Cancelar Edición
      </Link>
      <div className="flex-1 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-4 md:p-6 overflow-hidden">
        <Suspense fallback={<div className="flex justify-center h-full items-center"><Spinner/></div>}>
          <BillProvider>
            <EditSaleWrapper sale={sale} session={session} />
          </BillProvider>
        </Suspense>
      </div>
    </div>
  );
}
