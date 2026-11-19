import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateClient } from "@/actions/clients";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { updateClientSchema } from "@/schemas";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    client: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    order: { update: vi.fn() },
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

const validClientUpdate = {
  id: "client-1",
  name: "Cliente de prueba",
  address: "Calle 123",
  cellPhone: "01144445555",
  cuit: "20123456789",
  ivaCondition: "Consumidor Final",
  email: "cliente@example.test",
  fiscalDocumentType: "DNI",
  fiscalDocumentNumber: "00123456",
};

describe("persistent Client fiscal identity update boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({ user: { id: "user-1", businessId: "business-1" } } as never);
    vi.mocked(db.client.findFirst).mockResolvedValue({
      id: "client-1",
      cuit: "20123456789",
      fiscalDocumentType: null,
      fiscalDocumentNumber: null,
    } as never);
    vi.mocked(db.client.update).mockResolvedValue({ ...validClientUpdate, last_update: new Date() } as never);
  });

  it.each([
    ["CUIT", "20123456789"],
    ["DNI", "00123456"],
  ] as const)("accepts one complete %s pair as a text value", (fiscalDocumentType, fiscalDocumentNumber) => {
    const parsed = updateClientSchema.safeParse({
      ...validClientUpdate,
      fiscalDocumentType,
      fiscalDocumentNumber,
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect((parsed.data as typeof validClientUpdate).fiscalDocumentNumber).toBe(fiscalDocumentNumber);
    }
  });

  it("accepts both identity values absent but rejects a type or number on its own", () => {
    expect(updateClientSchema.safeParse({
      ...validClientUpdate,
      fiscalDocumentType: null,
      fiscalDocumentNumber: null,
    }).success).toBe(true);

    expect(updateClientSchema.safeParse({
      ...validClientUpdate,
      fiscalDocumentType: "DNI",
      fiscalDocumentNumber: null,
    }).success).toBe(false);
    expect(updateClientSchema.safeParse({
      ...validClientUpdate,
      fiscalDocumentType: null,
      fiscalDocumentNumber: "00123456",
    }).success).toBe(false);
  });

  it("rejects extra simultaneous document fields instead of accepting two identity pairs", () => {
    expect(updateClientSchema.safeParse({
      ...validClientUpdate,
      dni: "00123456",
      cuitNumber: "20123456789",
    }).success).toBe(false);
  });

  it("persists IVA and the single identity pair only after tenant-scoped Client lookup", async () => {
    const result = await updateClient(validClientUpdate);

    expect(result.success).toBe(true);
    expect(db.client.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "client-1", businessId: "business-1" },
    }));
    expect(db.client.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "client-1" },
      data: expect.objectContaining({
        ivaCondition: "Consumidor Final",
        fiscalDocumentType: "DNI",
        fiscalDocumentNumber: "00123456",
      }),
    }));
    expect(db.order.update).not.toHaveBeenCalled();
  });

  it("atomically mirrors a CUIT into both typed fields and the legacy cuit field", async () => {
    const result = await updateClient({
      ...validClientUpdate,
      cuit: "stale-legacy-value",
      fiscalDocumentType: "CUIT",
      fiscalDocumentNumber: "20123456789",
    });

    expect(result.success).toBe(true);
    expect(db.client.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        fiscalDocumentType: "CUIT",
        fiscalDocumentNumber: "20123456789",
        cuit: "20123456789",
      }),
    }));
  });

  it("atomically clears the legacy cuit when saving a DNI pair", async () => {
    const result = await updateClient({
      ...validClientUpdate,
      cuit: "",
      fiscalDocumentType: "DNI",
      fiscalDocumentNumber: "00123456",
    });

    expect(result.success).toBe(true);
    expect(db.client.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        fiscalDocumentType: "DNI",
        fiscalDocumentNumber: "00123456",
        cuit: null,
      }),
    }));
  });

  it("does not update a Client owned by a different tenant", async () => {
    vi.mocked(db.client.findFirst).mockResolvedValue(null as never);

    const result = await updateClient({ ...validClientUpdate, id: "other-tenant-client" });

    expect(result).toMatchObject({ success: false, code: "NOT_FOUND" });
    expect(db.client.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "other-tenant-client", businessId: "business-1" },
    }));
    expect(db.client.update).not.toHaveBeenCalled();
  });

  it("rejects a type change that reuses the prior effective legacy CUIT number", async () => {
    const result = await updateClient({
      ...validClientUpdate,
      fiscalDocumentType: "DNI",
      fiscalDocumentNumber: "20123456789",
    });

    expect(result).toMatchObject({ success: false, code: "VALIDATION" });
    expect(db.client.update).not.toHaveBeenCalled();
  });

  it("permits explicitly clearing a persisted identity pair atomically", async () => {
    vi.mocked(db.client.findFirst).mockResolvedValue({
      id: "client-1",
      cuit: "",
      fiscalDocumentType: "DNI",
      fiscalDocumentNumber: "00123456",
    } as never);

    const result = await updateClient({
      ...validClientUpdate,
      cuit: "",
      fiscalDocumentType: null,
      fiscalDocumentNumber: null,
    });

    expect(result.success).toBe(true);
    expect(db.client.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "client-1" },
      data: expect.objectContaining({ fiscalDocumentType: null, fiscalDocumentNumber: null, cuit: null }),
    }));
  });

  it("rejects a type-only update and cannot reuse the effective old legacy CUIT number", async () => {
    const partial = await updateClient({
      ...validClientUpdate,
      fiscalDocumentType: "DNI",
      fiscalDocumentNumber: null,
    });
    expect(partial).toMatchObject({ success: false, code: "VALIDATION" });
    expect(db.client.update).not.toHaveBeenCalled();

    const reused = await updateClient({
      ...validClientUpdate,
      fiscalDocumentType: "DNI",
      fiscalDocumentNumber: "20123456789",
    });
    expect(reused).toMatchObject({ success: false, code: "VALIDATION" });
    expect(db.client.update).not.toHaveBeenCalled();
  });
});
