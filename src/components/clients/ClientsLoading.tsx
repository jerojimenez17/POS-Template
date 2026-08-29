export function Skeleton() {
  return <div role="status" aria-label="Cargando clientes" className="space-y-3"><div className="h-8 w-40 animate-pulse rounded bg-muted" /><div className="h-10 w-full animate-pulse rounded bg-muted" />{[1, 2, 3].map((item) => <div key={item} className="h-20 animate-pulse rounded bg-muted" />)}</div>;
}
