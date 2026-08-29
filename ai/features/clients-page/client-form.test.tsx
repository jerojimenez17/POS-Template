import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ClientForm from "@/components/clients/ClientForm";

const date = new Date("2026-01-01");
const client = (name: string, email: string) => ({ id: name, name, address: "Calle", cellPhone: "111", cuit: null, ivaCondition: null, email, balance: 0, date, last_update: date });

describe("ClientForm", () => {
  it("resets all editable values when the selected client changes without remounting", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(<ClientForm client={client("Ana", "ana@example.com")} onSubmit={onSubmit} onCancel={vi.fn()} />);
    await user.clear(screen.getByLabelText(/nombre/i));
    await user.type(screen.getByLabelText(/nombre/i), "Draft");
    rerender(<ClientForm client={client("Bruno", "bruno@example.com")} onSubmit={onSubmit} onCancel={vi.fn()} />);
    expect(screen.getByLabelText(/nombre/i)).toHaveValue("Bruno");
    expect(screen.getByLabelText("Email")).toHaveValue("bruno@example.com");
    expect(screen.getByLabelText("Dirección")).toHaveValue("Calle");
  });

  it("announces required and malformed values through role=alert and does not submit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ClientForm onSubmit={onSubmit} onCancel={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /guardar cliente/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/nombre/i);
    expect(onSubmit).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText(/nombre/i), "Valido");
    await user.type(screen.getByLabelText("Email"), "not-an-email");
    await user.click(screen.getByRole("button", { name: /guardar cliente/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/email/i);
    expect(screen.getByLabelText(/nombre/i)).toHaveValue("Valido");
  });

  it("keeps entered values after a server failure and exposes a busy submit state", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(() => new Promise<void>(() => undefined));
    render(<ClientForm onSubmit={onSubmit} onCancel={vi.fn()} />);
    await user.type(screen.getByLabelText(/nombre/i), "Nueva");
    const submit = screen.getByRole("button", { name: /guardar cliente/i });
    await user.click(submit);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText(/nombre/i)).toHaveValue("Nueva");
  });
});
