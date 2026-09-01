import { Skeleton } from "@/components/clients/ClientsLoading";

export default function ClientsLoading() {
  return <main aria-busy="true" aria-label="Cargando clientes" className="container mx-auto max-w-6xl px-4 py-8"><Skeleton /></main>;
}
