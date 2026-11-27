import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

import ArcaPage from "@/app/superadmin/businesses/[id]/arca/page";

vi.mock("@/actions/arca", () => ({
  getBusinessArcaData: vi.fn().mockResolvedValue({
    success: {
      cuit: "20123456789",
      razonSocial: "Test",
      inicioActividades: new Date(),
      condicionIva: "MONOTRIBUTO",
      cert: "CONFIGURADO",
      key: "CONFIGURADO",
      ptoVenta: [],
    },
  }),
}));
vi.mock("@/components/Superadmin/arca-form", () => ({
  ArcaForm: ({ initialData }: { initialData: { cert?: string; key?: string } }) => (
    <div data-cert={initialData.cert} data-key={initialData.key} />
  ),
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}));
vi.mock("next/link", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("superadmin ARCA page", () => {
  it("passes presence-only certificate markers to ArcaForm", async () => {
    const page = await ArcaPage({ params: Promise.resolve({ id: "business-target" }) });
    render(page);

    const form = document.querySelector("[data-cert]");
    expect(form).toHaveAttribute("data-cert", "CONFIGURADO");
    expect(form).toHaveAttribute("data-key", "CONFIGURADO");
    expect(form).not.toHaveTextContent("BEGIN");
  });
});
