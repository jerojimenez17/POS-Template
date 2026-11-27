import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

describe("account-ledger detail route loading and error boundaries", () => {
  it("shows an accessible route-specific skeleton without order or customer data", async () => {
    const modules = import.meta.glob<{
      default: () => ReactNode;
    }>("/src/app/(protected)/account-ledger/[id]/loading.tsx");
    const loadModule = Object.values(modules)[0];

    expect(loadModule, "the detail segment must define its own loading.tsx").toBeDefined();
    if (!loadModule) return;

    const { default: Loading } = await loadModule();
    const { container } = render(<Loading />);

    expect(container.querySelector('[role="status"], [aria-busy="true"]')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/ORD-SECRET-541|CLIENT-SECRET-927|customer@example\.test/i);
  });

  it("renders a safe localized error and retries through the route boundary", async () => {
    const modules = import.meta.glob<{
      default: (props: { error: Error & { digest?: string }; reset: () => void }) => ReactNode;
    }>("/src/app/(protected)/account-ledger/[id]/error.tsx");
    const loadModule = Object.values(modules)[0];

    expect(loadModule, "the detail segment must define its own error.tsx").toBeDefined();
    if (!loadModule) return;

    const { default: ErrorBoundary } = await loadModule();
    const reset = vi.fn();
    render(<ErrorBoundary error={new Error("Prisma SQL_SECRET: select * from customer") as Error & { digest?: string }} reset={reset} />);

    expect(screen.getByRole("alert")).toHaveTextContent(/no se pudo cargar|ocurrió un error/i);
    expect(screen.queryByText(/Prisma|SQL_SECRET|select \* from customer/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /reintentar|intentar de nuevo/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
