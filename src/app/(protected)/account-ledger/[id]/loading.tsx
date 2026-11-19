export default function AccountLedgerDetailLoading() {
  return (
    <main
      className="container mx-auto max-w-5xl px-4 py-8"
      role="status"
      aria-busy="true"
      aria-label="Cargando detalle de cuenta"
    >
      <span className="sr-only">Cargando detalle de cuenta…</span>
      <div className="mb-6 h-9 w-32 animate-pulse rounded bg-muted" />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <section className="space-y-6 rounded-lg border p-6 md:col-span-2" aria-hidden="true">
          <div className="h-7 w-56 animate-pulse rounded bg-muted" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="h-20 animate-pulse rounded bg-muted" />
            <div className="h-20 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-8 w-32 animate-pulse rounded bg-muted" />
          <div className="space-y-3">
            <div className="h-12 animate-pulse rounded bg-muted" />
            <div className="h-12 animate-pulse rounded bg-muted" />
            <div className="h-12 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-8 w-40 animate-pulse rounded bg-muted" />
          <div className="h-16 animate-pulse rounded bg-muted" />
        </section>
        <aside className="h-80 animate-pulse rounded-lg border bg-muted/40" aria-hidden="true" />
      </div>
    </main>
  );
}
