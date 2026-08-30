import { describe, expect, it } from "vitest";

interface SchemaModule {
  clientFormSchema?: { safeParse: (value: unknown) => { success: boolean; data?: unknown } };
  createClientSchema?: { safeParse: (value: unknown) => { success: boolean; data?: unknown } };
}

describe("client CRUD validation contract", () => {
  it("accepts a complete client form and normalizes text fields", async () => {
    const schemas = (await import("@/schemas")) as unknown as SchemaModule;
    const schema = schemas.clientFormSchema ?? schemas.createClientSchema;
    expect(schema, "export a client CRUD Zod schema").toBeDefined();

    const result = schema!.safeParse({
      name: "  Ana Pérez  ",
      address: "  Calle 1  ",
      cellPhone: "  +54 9 11 5555  ",
      cuit: "20-12345678-9",
      ivaCondition: "Monotributista",
      email: "  ANA@EXAMPLE.COM ",
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      name: "Ana Pérez",
      address: "Calle 1",
      email: "ana@example.com",
      cuit: "20-12345678-9",
    });
  });

  const invalidInputs: unknown[] = [
    { name: "   " },
    { name: "Valid", email: "not-an-email" },
    { name: "a".repeat(101) },
    { name: "Valid", address: "a".repeat(201) },
    { name: "Valid", cellPhone: "1".repeat(51) },
    { name: "Valid", cuit: "1".repeat(21) },
    { name: "Valid", ivaCondition: "Administrador fraudulento" },
    { name: "Valid", businessId: "other-business" },
    { name: "Valid", balance: 999999, orders: [] },
  ];

  it.each(invalidInputs)("rejects invalid payload", async (input: unknown) => {
    const schemas = (await import("@/schemas")) as unknown as SchemaModule;
    const schema = schemas.clientFormSchema ?? schemas.createClientSchema;
    expect(schema).toBeDefined();
    expect(schema!.safeParse(input).success).toBe(false);
  });
});
