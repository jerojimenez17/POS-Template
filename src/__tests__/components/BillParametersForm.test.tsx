import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { useForm } from "react-hook-form";
import ClientConditions from "@/models/ClientConditions";

(globalThis as unknown as { React: typeof React }).React = React;

const TestForm = ({ onSubmit }: { onSubmit: (data: { clientCondition: string; documentNumber: number }) => void }) => {
  const { register, handleSubmit, watch } = useForm({
    defaultValues: {
      clientCondition: ClientConditions.CONSUMIDOR_FINAL,
      documentNumber: 0,
    },
  });

  const clientCondition = watch("clientCondition");
  const showDocumentInput = clientCondition !== ClientConditions.CONSUMIDOR_FINAL;

  return (
    <form onSubmit={handleSubmit((data) => {
      onSubmit({
        clientCondition: data.clientCondition,
        documentNumber: data.documentNumber ?? 0,
      });
    })}>
      <select {...register("clientCondition")} data-testid="client-condition">
        <option value={ClientConditions.CONSUMIDOR_FINAL}>Consumidor Final</option>
        <option value={ClientConditions.CUIT}>CUIT</option>
        <option value={ClientConditions.DNI}>DNI</option>
      </select>
      
      {showDocumentInput && (
        <input 
          data-testid="document-input"
          type="number"
          {...register("documentNumber", { valueAsNumber: true })} 
          placeholder="Enter document number"
        />
      )}
      
      <button type="submit" data-testid="submit">Submit</button>
    </form>
  );
};

describe("Document Number Bug Fix - Test Cases", () => {
  describe("TC1: DNI Selection", () => {
    it("should capture documentNumber as 12345678 when DNI is selected and 12345678 is entered", async () => {
      const onSubmit = vi.fn();
      
      render(<TestForm onSubmit={onSubmit} />);
      
      const conditionSelect = screen.getByTestId("client-condition");
      fireEvent.change(conditionSelect, { target: { value: ClientConditions.DNI } });
      
      await waitFor(() => {
        const input = screen.getByTestId("document-input");
        fireEvent.change(input, { target: { value: "12345678" } });
      });
      
      fireEvent.click(screen.getByTestId("submit"));
      
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalled();
        const call = onSubmit.mock.calls[0][0];
        expect(call.clientCondition).toBe(ClientConditions.DNI);
        expect(call.documentNumber).toBe(12345678);
      });
    });
  });

  describe("TC2: CUIT Selection", () => {
    it("should capture documentNumber as 20345678901 when CUIT is selected and 20345678901 is entered", async () => {
      const onSubmit = vi.fn();
      
      render(<TestForm onSubmit={onSubmit} />);
      
      const conditionSelect = screen.getByTestId("client-condition");
      fireEvent.change(conditionSelect, { target: { value: ClientConditions.CUIT } });
      
      await waitFor(() => {
        const input = screen.getByTestId("document-input");
        fireEvent.change(input, { target: { value: "20345678901" } });
      });
      
      fireEvent.click(screen.getByTestId("submit"));
      
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalled();
        const call = onSubmit.mock.calls[0][0];
        expect(call.clientCondition).toBe(ClientConditions.CUIT);
        expect(call.documentNumber).toBe(20345678901);
      });
    });
  });

  describe("TC3: Consumidor Final Selection", () => {
    it("should capture documentNumber as 0 when Consumidor Final is selected", async () => {
      const onSubmit = vi.fn();
      
      render(<TestForm onSubmit={onSubmit} />);
      
      fireEvent.click(screen.getByTestId("submit"));
      
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalled();
        const call = onSubmit.mock.calls[0][0];
        expect(call.clientCondition).toBe(ClientConditions.CONSUMIDOR_FINAL);
        expect(call.documentNumber).toBe(0);
      });
    });
  });

  describe("TC4: Switch from DNI to CUIT", () => {
    it("should capture the new CUIT value when user enters DNI value, switches to CUIT, and enters new CUIT value", async () => {
      const onSubmit = vi.fn();
      
      render(<TestForm onSubmit={onSubmit} />);
      
      const conditionSelect = screen.getByTestId("client-condition");
      
      fireEvent.change(conditionSelect, { target: { value: ClientConditions.DNI } });
      await waitFor(() => {
        const input = screen.getByTestId("document-input");
        fireEvent.change(input, { target: { value: "12345678" } });
      });

      fireEvent.change(conditionSelect, { target: { value: ClientConditions.CUIT } });
      await waitFor(() => {
        const input = screen.getByTestId("document-input");
        fireEvent.change(input, { target: { value: "20345678901" } });
      });
      
      fireEvent.click(screen.getByTestId("submit"));
      
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalled();
        const call = onSubmit.mock.calls[0][0];
        expect(call.clientCondition).toBe(ClientConditions.CUIT);
        expect(call.documentNumber).toBe(20345678901);
        expect(call.documentNumber).not.toBe(12345678);
      });
    });
  });

  describe("TC5: Switch from CUIT to DNI", () => {
    it("should capture the new DNI value when user enters CUIT value, switches to DNI, and enters new DNI value", async () => {
      const onSubmit = vi.fn();
      
      render(<TestForm onSubmit={onSubmit} />);
      
      const conditionSelect = screen.getByTestId("client-condition");
      
      fireEvent.change(conditionSelect, { target: { value: ClientConditions.CUIT } });
      await waitFor(() => {
        const input = screen.getByTestId("document-input");
        fireEvent.change(input, { target: { value: "20345678901" } });
      });

      fireEvent.change(conditionSelect, { target: { value: ClientConditions.DNI } });
      await waitFor(() => {
        const input = screen.getByTestId("document-input");
        fireEvent.change(input, { target: { value: "87654321" } });
      });
      
      fireEvent.click(screen.getByTestId("submit"));
      
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalled();
        const call = onSubmit.mock.calls[0][0];
        expect(call.clientCondition).toBe(ClientConditions.DNI);
        expect(call.documentNumber).toBe(87654321);
        expect(call.documentNumber).not.toBe(20345678901);
      });
    });
  });
});
