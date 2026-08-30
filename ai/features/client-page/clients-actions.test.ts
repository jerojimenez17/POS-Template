import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, clientDb, orderDb, transaction } = vi.hoisted(() => ({
  authMock: vi.fn(),
  clientDb: {
  findMany: vi.fn(),
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  },
  orderDb: { count: vi.fn() },
  transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({ client: undefined })),
}));

transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({ client: clientDb, order: orderDb }));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({ db: { client: clientDb, order: orderDb, $transaction: transaction } }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));

const ownSession = { user: { id: "user-a", businessId: "business-a" } };
const foreignClient = { id: "client-b", name: "Negocio B", businessId: "business-b" };
const ownClient = {
  id: "client-a", name: "Ana", address: null, cellPhone: null, cuit: null,
  ivaCondition: null, email: null, balance: 0, date: new Date("2026-01-01"),
  last_update: new Date("2026-01-01"), businessId: "business-a",
};

async function actions(): Promise<Record<string, (...args: unknown[]) => Promise<unknown>>> {
  return (await import("@/actions/clients")) as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
}

describe("client server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue(ownSession);
    clientDb.findMany.mockResolvedValue([ownClient]);
    clientDb.create.mockResolvedValue(ownClient);
    clientDb.update.mockResolvedValue(ownClient);
    clientDb.delete.mockResolvedValue(ownClient);
    orderDb.count.mockResolvedValue(0);
  });

  it("lists only the authenticated business, ordered and explicitly selected", async () => {
    const result = await (await actions()).getClients();
    expect(result).toMatchObject({ success: true, data: [ownClient] });
    expect(clientDb.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { businessId: "business-a" }, orderBy: { name: "asc" },
      select: expect.objectContaining({ id: true, name: true, email: true, balance: true, date: true, last_update: true }),
    }));
  });

  it("does not query when the session has no business", async () => {
    authMock.mockResolvedValue({ user: { id: "user-a" } });
    const result = await (await actions()).getClients();
    expect(result).toMatchObject({ success: false, code: "UNAUTHORIZED" });
    expect(clientDb.findMany).not.toHaveBeenCalled();
  });

  it("creates with the session business and zero balance, ignoring client authorization fields", async () => {
    const result = await (await actions()).createClient({ name: "Nueva", businessId: "business-b", balance: 900 } as never);
    expect(result).toMatchObject({ success: true });
    expect(clientDb.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ name: "Nueva", businessId: "business-a", balance: 0 }),
    }));
  });

  it("rejects invalid create payloads without writing", async () => {
    const result = await (await actions()).createClient({ name: "", email: "bad" } as never);
    expect(result).toMatchObject({ success: false, code: "VALIDATION" });
    expect(clientDb.create).not.toHaveBeenCalled();
  });

  it("updates and deletes only records belonging to the session business", async () => {
    clientDb.findFirst.mockResolvedValue(ownClient);
    const module = await actions();
    await module.updateClient({ id: "client-a", name: "Ana actualizada", balance: 999, businessId: "business-b" } as never);
    expect(clientDb.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "client-a", businessId: "business-a" },
      data: expect.not.objectContaining({ balance: 999, businessId: "business-b" }),
    }));

    clientDb.findFirst.mockResolvedValue(null);
    const result = await module.deleteClient({ id: foreignClient.id } as never);
    expect(result).toMatchObject({ success: false });
    expect(clientDb.delete).not.toHaveBeenCalled();
  });

  it("returns conflict and preserves a client with orders", async () => {
    clientDb.findFirst.mockResolvedValue(ownClient);
    orderDb.count.mockResolvedValue(2);
    const result = await (await actions()).deleteClient({ id: ownClient.id } as never);
    expect(result).toMatchObject({ success: false, code: "CONFLICT" });
    expect(clientDb.delete).not.toHaveBeenCalled();
  });

  it("protects balance updates with authentication and business ownership", async () => {
    clientDb.findUnique.mockResolvedValue(foreignClient);
    const module = await actions();
    authMock.mockResolvedValue(null);
    expect(await module.updateClientBalance("client-a", 10)).toMatchObject({ success: false, code: "UNAUTHORIZED" });
    expect(clientDb.update).not.toHaveBeenCalled();

    authMock.mockResolvedValue(ownSession);
    expect(await module.updateClientBalance(foreignClient.id, 10)).toMatchObject({ success: false });
    expect(clientDb.update).not.toHaveBeenCalled();
  });
});
