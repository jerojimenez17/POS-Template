"use client";

import { Button } from "@/components/ui/button";

interface AccountLedgerDetailErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
  unstable_retry?: () => void;
}

export default function AccountLedgerDetailError({
  reset,
  unstable_retry,
}: AccountLedgerDetailErrorProps) {
  const retry = unstable_retry ?? reset;

  return (
    <main className="container mx-auto max-w-4xl px-4 py-12">
      <section
        className="rounded-lg border border-destructive/30 bg-card p-6 text-center"
        role="alert"
        aria-live="assertive"
      >
        <h1 className="text-lg font-semibold">No se pudo cargar el detalle de la cuenta</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ocurrió un error inesperado. Intente nuevamente.
        </p>
        <Button className="mt-5" type="button" onClick={retry}>
          Reintentar
        </Button>
      </section>
    </main>
  );
}
