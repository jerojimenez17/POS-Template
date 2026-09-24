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
    await user.type(screen.getByPlaceholderText("contraseña"), "password");
    await user.click(screen.getByRole("button", { name: "Generar Certificados" }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Certificados generados y guardados correctamente")).toBeInTheDocument();
    expect(screen.getAllByRole("textbox").every((field) => !(field as HTMLInputElement).value.includes("BEGIN"))).toBe(true);
  });
});
