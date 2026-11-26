import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ArcaForm } from "@/components/Superadmin/arca-form";
import { generateCertsAction } from "@/actions/generate-certs";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/actions/generate-certs", () => ({ generateCertsAction: vi.fn() }));
vi.mock("@/actions/arca", () => ({ updateBusinessArcaData: vi.fn() }));

describe("ArcaForm: generación de certificados", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(generateCertsAction).mockResolvedValue({ success: "Certificados generados y guardados correctamente" });
  });

  it("refresca los datos de servidor después de generar PROD y no muestra PEM/key", async () => {
    const user = userEvent.setup();
    render(<ArcaForm businessId="business-target" initialData={{ cert: "", key: "", cuit: "20123456789", razonSocial: "Test", inicioActividades: new Date(), condicionIva: "MONOTRIBUTO", ptoVenta: [] }} />);

    await user.click(screen.getByRole("button", { name: /generar certificados/i }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /^prod/i }));
    await user.click(within(dialog).getByRole("button", { name: "Siguiente" }));
    await user.type(within(dialog).getByLabelText("Contraseña"), "password");
    await user.click(within(dialog).getByRole("button", { name: "Siguiente" }));
    await user.click(within(dialog).getByRole("button", { name: "Siguiente" }));
    await user.click(within(dialog).getByRole("button", { name: "Generar Certificados" }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Certificados generados y guardados correctamente")).toBeInTheDocument();
    expect(screen.getAllByRole("textbox").every((field) => !(field as HTMLInputElement).value.includes("BEGIN"))).toBe(true);
  });

  it("mantiene deshabilitada la generación si el alias está vacío o sólo contiene espacios", async () => {
    const user = userEvent.setup();
    render(<ArcaForm businessId="business-target" initialData={{ cert: "", key: "", cuit: "20123456789", razonSocial: "Test", inicioActividades: new Date(), condicionIva: "MONOTRIBUTO", ptoVenta: [] }} />);

    await user.click(screen.getByRole("button", { name: /generar certificados/i }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /^prod/i }));
    await user.click(within(dialog).getByRole("button", { name: "Siguiente" }));
    await user.type(within(dialog).getByLabelText("Contraseña"), "password");
    const alias = within(dialog).getByLabelText("Alias");
    await user.clear(alias);
    await user.type(alias, "   ");
    await user.click(within(dialog).getByRole("button", { name: "Siguiente" }));
    await user.click(within(dialog).getByRole("button", { name: "Siguiente" }));

    expect(within(dialog).getByRole("button", { name: "Generar Certificados" })).toBeDisabled();
    expect(generateCertsAction).not.toHaveBeenCalled();
  });

  it("en el paso 3 muestra los certificados configurados en verde con opción de reemplazar", async () => {
    const user = userEvent.setup();
    render(<ArcaForm businessId="business-target" initialData={{ cert: "CONFIGURADO", key: "CONFIGURADO", cuit: "20123456789", razonSocial: "Test", inicioActividades: new Date(), condicionIva: "MONOTRIBUTO", ptoVenta: [] }} />);

    await user.click(screen.getByRole("button", { name: /reemplazar certificados/i }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Siguiente" }));
    await user.click(within(dialog).getByRole("button", { name: "Siguiente" }));

    expect(within(dialog).getAllByText("Configurado")).toHaveLength(2);
    expect(within(dialog).getAllByRole("button", { name: "Reemplazar" })).toHaveLength(2);
  });

  it("en el paso 3 permite cargar archivo o pegar texto cuando no está configurado", async () => {
    const user = userEvent.setup();
    render(<ArcaForm businessId="business-target" initialData={{ cert: "", key: "", cuit: "20123456789", razonSocial: "Test", inicioActividades: new Date(), condicionIva: "MONOTRIBUTO", ptoVenta: [] }} />);

    await user.click(screen.getByRole("button", { name: /generar certificados/i }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Siguiente" }));
    await user.click(within(dialog).getByRole("button", { name: "Siguiente" }));

    expect(within(dialog).getAllByText("Cargar archivo")).toHaveLength(2);
    expect(within(dialog).getAllByText("O pegar el texto")).toHaveLength(2);
    expect(within(dialog).getAllByText("Sin configurar")).toHaveLength(2);
  });

  it("conserva la interacción de puntos de venta y confirma el borrado", async () => {
    const user = userEvent.setup();
    render(<ArcaForm businessId="business-target" initialData={{ cert: "", key: "", cuit: "20123456789", razonSocial: "Test", inicioActividades: new Date(), condicionIva: "MONOTRIBUTO", ptoVenta: [] }} />);

    await user.click(screen.getByRole("button", { name: /agregar punto de venta/i }));
    expect(screen.getByLabelText("Número del punto de venta 1")).toHaveValue(1);
    await user.click(screen.getByRole("button", { name: /eliminar punto de venta 1/i }));
    expect(screen.getByRole("dialog", { name: "¿Eliminar punto de venta?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /sí, eliminar/i }));
    expect(screen.getByText(/no hay puntos de venta configurados/i)).toBeInTheDocument();
  });
});
