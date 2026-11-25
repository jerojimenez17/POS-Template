import PeriodicReport from "@/components/PeriodicReport";
import ReportHeader from "@/components/report/ReportHeader";
import { auth } from "../../../../auth";
import { Suspense } from "react";

export const ReportLoadingFallback = () => (
  <section
    aria-label="Cargando reporte"
    aria-live="polite"
    className="rounded-xl border border-border/60 bg-card p-4 shadow-sm sm:p-6"
    role="status"
  >
    <div className="animate-pulse space-y-4" aria-hidden="true">
      <div className="h-5 w-40 rounded bg-muted" />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="h-20 rounded-lg bg-muted" />
        <div className="h-20 rounded-lg bg-muted" />
        <div className="h-20 rounded-lg bg-muted" />
      </div>
      <div className="h-32 rounded-lg bg-muted" />
    </div>
    <span className="sr-only">Cargando reporte</span>
  </section>
);

const ReportPage = async () => {
  const session = await auth();
  return (
    <main className="flex h-full flex-col bg-muted/20">
      <ReportHeader />
      <div className="h-full space-y-6 overflow-y-auto p-3 pb-20 md:space-y-8 md:p-6 md:pb-24">
        <Suspense fallback={<ReportLoadingFallback />}>
          <PeriodicReport session={session} period="daily" />
        </Suspense>
        <Suspense fallback={<ReportLoadingFallback />}>
          <PeriodicReport session={session} period="monthly" />
        </Suspense>
        <Suspense fallback={<ReportLoadingFallback />}>
          <PeriodicReport session={session} period="yearly" />
        </Suspense>
      </div>
    </main>
  );
};
export default ReportPage;
