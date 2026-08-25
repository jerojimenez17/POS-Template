export default function ClientsLoading() {
  return (
    <main
      aria-busy="true"
      aria-label="Cargando clientes"
      className="container mx-auto max-w-6xl px-4 py-8"
    >
      <div className="mb-6 h-8 w-40 animate-pulse rounded bg-muted" />
      <div className="mb-5 h-10 w-full animate-pulse rounded bg-muted" />
      <div className="space-y-3">
        {["uno", "dos", "tres"].map((item) => (
          <div key={item} className="h-24 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    </main>
  );
}
