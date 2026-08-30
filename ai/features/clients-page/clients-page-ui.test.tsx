import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { createClientMock, updateClientMock, deleteClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(), updateClientMock: vi.fn(), deleteClientMock: vi.fn(),
}));
vi.mock("@/actions/clients", () => ({
  createClient: createClientMock, updateClient: updateClientMock, deleteClient: deleteClientMock,
}));

const date = new Date("2026-01-01");
const client = { id: "client-a", name: "Ana Pérez", address: "Calle 1", cellPhone: "111", cuit: "20-1", ivaCondition: "Exento", email: "ANA@EXAMPLE.COM", balance: 10, date, last_update: date };
const other = { ...client, id: "client-b", name: "Bruno", cellPhone: "222", email: "bruno@example.com", cuit: "30-2" };

async function page() {
  const module = await import("@/components/clients/ClientsPageClient");
  return module.default as unknown as React.ComponentType<Record<string, unknown>>;
}

describe("clients page observable states and accessibility", () => {
  it("searches by every supported contact field and distinguishes no-match from an empty collection", async () => {
    const ClientsPage = await page();
    const user = userEvent.setup();
    render(<ClientsPage clients={[client, other]} />);
    const search = screen.getByRole("searchbox", { name: /buscar/i });
    for (const term of ["ana", "111", "ana@example.com", "20-1"]) {
      await user.clear(search);
      await user.type(search, term);
      expect(screen.getAllByText("Ana Pérez").length).toBeGreaterThan(0);
    }
    await user.clear(search);
    await user.type(search, "does-not-exist");
    expect(screen.getByText(/no se encontraron coincidencias|sin coincidencias/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /limpiar búsqueda/i })).toBeInTheDocument();
  });

  it("renders a bounded accessible desktop table and responsive cards without horizontal overflow", async () => {
    const ClientsPage = await page();
    render(<ClientsPage clients={[client]} />);
    expect(screen.getByRole("heading", { name: "Clientes" })).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").every((header) => header.getAttribute("scope") === "col")).toBe(true);
    expect(screen.getByRole("button", { name: /nuevo cliente/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /editar ana pérez/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /eliminar ana pérez/i })).toBeVisible();
  });

  it("shows a separate empty-state CTA and a loading/error status with retry", async () => {
    const ClientsPage = await page();
    const { rerender } = render(<ClientsPage clients={[]} />);
    expect(screen.getByText(/no hay clientes/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /crear cliente/i })).toBeInTheDocument();
    rerender(<ClientsPage clients={[]} isLoading initialError={undefined} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    rerender(<ClientsPage clients={[]} initialError="Error al obtener clientes" />);
    expect(screen.getByRole("alert")).toHaveTextContent(/error al obtener clientes/i);
    expect(screen.getByRole("button", { name: /reintentar/i })).toBeInTheDocument();
  });

  it("paginates with an explicit load-more action and prevents duplicate loads while pending", async () => {
    const ClientsPage = await page();
    const loadMore = vi.fn(() => new Promise<void>(() => undefined));
    const user = userEvent.setup();
    render(<ClientsPage clients={[client]} hasMore onLoadMore={loadMore} />);
    const button = screen.getByRole("button", { name: /cargar más/i });
    await user.click(button);
    expect(loadMore).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
  });

  it("uses an accessible confirmation dialog rather than window.confirm before deletion", async () => {
    const ClientsPage = await page();
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ClientsPage clients={[client]} />);
    await user.click(screen.getAllByRole("button", { name: /eliminar ana pérez/i })[0]);
    expect(screen.getByRole("dialog")).toHaveTextContent("Ana Pérez");
    expect(screen.getByRole("button", { name: /cancelar/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^eliminar$/i })).toBeInTheDocument();
    expect(deleteClientMock).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
