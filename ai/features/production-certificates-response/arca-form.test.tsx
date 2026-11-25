import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

    await user.click(screen.getByRole("button", { name: /generar prod/i }));
    await user.type(screen.getByLabelText("Contraseña"), "password");
    await user.click(screen.getByRole("button", { name: "Generar Certificados" }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Certificados generados y guardados correctamente")).toBeInTheDocument();
    expect(screen.getAllByRole("textbox").every((field) => !(field as HTMLInputElement).value.includes("BEGIN"))).toBe(true);
  });

  it("mantiene deshabilitada la generación si el alias está vacío o sólo contiene espacios", async () => {
    const user = userEvent.setup();
    render(<ArcaForm businessId="business-target" initialData={{ cert: "", key: "", cuit: "20123456789", razonSocial: "Test", inicioActividades: new Date(), condicionIva: "MONOTRIBUTO", ptoVenta: [] }} />);

    await user.click(screen.getByRole("button", { name: /generar prod/i }));
    await user.type(screen.getByLabelText("Contraseña"), "password");
    const alias = screen.getByLabelText("Alias");
    await user.clear(alias);
    await user.type(alias, "   ");

    expect(screen.getByRole("button", { name: "Generar Certificados" })).toBeDisabled();
    expect(generateCertsAction).not.toHaveBeenCalled();
  });

  it("muestra el estado configurado sin hidratar CERT o KEY con contenido sensible", () => {
    render(<ArcaForm businessId="business-target" initialData={{ cert: "CONFIGURADO", key: "CONFIGURADO", cuit: "20123456789", razonSocial: "Test", inicioActividades: new Date(), condicionIva: "MONOTRIBUTO", ptoVenta: [] }} />);

    expect(screen.getAllByText("Configurado")).toHaveLength(2);
    expect(screen.getByLabelText("Certificado (CERT)")).toHaveValue("");
    expect(screen.getByLabelText("Llave Privada (KEY)")).toHaveValue("");
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
