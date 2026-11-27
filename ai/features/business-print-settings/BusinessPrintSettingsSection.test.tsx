import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateBusinessPrintSettingsAction } from "@/actions/business-print-settings";
import BusinessPrintSettingsSection from "@/components/AdminSettings/BusinessPrintSettingsSection";

vi.mock("@/actions/business-print-settings", () => ({
  updateBusinessPrintSettingsAction: vi.fn(),
}));

const updateSettings = vi.mocked(updateBusinessPrintSettingsAction);

describe("BusinessPrintSettingsSection", () => {
  beforeEach(() => {
    updateSettings.mockReset();
  });

  it("renders one named native switch input", () => {
    const { container } = render(
      <BusinessPrintSettingsSection businessId="business-1" qzTray address={null} />,
    );

    expect(screen.getByLabelText("Dirección del establecimiento")).toHaveValue("");
    const toggle = screen.getByRole("switch", { name: /usar qz tray/i });
    expect(toggle).toBeChecked();
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(1);
    expect(screen.queryAllByRole("switch")).toHaveLength(1);
    expect(toggle.querySelectorAll("button")).toHaveLength(0);
    expect(screen.getByText(/preferencia guardada para este negocio/i)).toBeInTheDocument();
  });

  it("trims the address, converts blank input to null, and saves the current switch value", async () => {
    const user = userEvent.setup();
    updateSettings.mockResolvedValue({ success: "Guardado" });
    render(<BusinessPrintSettingsSection businessId="business-1" qzTray={false} address="Old" />);

    const address = screen.getByLabelText("Dirección del establecimiento");
    await user.clear(address);
    await user.type(address, "   ");
    await user.click(screen.getByRole("switch"));
    await user.click(screen.getByRole("button", { name: "Guardar configuración" }));

    expect(updateSettings).toHaveBeenCalledWith({ qzTray: true, address: null });
    expect(await screen.findByRole("status")).toHaveTextContent("Guardado");
  });

  it("disables duplicate saves while the action is pending and reports errors inline", async () => {
    const user = userEvent.setup();
    let resolve: (value: { error: string }) => void = () => undefined;
    updateSettings.mockReturnValue(new Promise((res) => { resolve = res; }));
    render(<BusinessPrintSettingsSection businessId="business-1" qzTray={false} address="Corrientes 123" />);

    const save = screen.getByRole("button", { name: "Guardar configuración" });
    await user.click(save);
    expect(screen.getByRole("button", { name: "Guardando..." })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Guardando..." }));
    expect(updateSettings).toHaveBeenCalledTimes(1);

    resolve({ error: "No autorizado" });
    expect(await screen.findByRole("status")).toHaveTextContent("No autorizado");
  });

  it("toggles with keyboard without introducing a nested interactive control", async () => {
    const user = userEvent.setup();
    render(<BusinessPrintSettingsSection businessId="business-1" qzTray={false} address="" />);

    const toggle = screen.getByRole("switch");
    toggle.focus();
    await user.keyboard(" ");

    expect(toggle).toBeChecked();
    expect(screen.queryAllByRole("switch")).toHaveLength(1);
    expect(screen.getByRole("switch", { name: /usar qz tray/i })).toBeChecked();
  });
});
