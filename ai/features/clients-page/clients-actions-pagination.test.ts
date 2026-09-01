import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, clientDb, orderDb, transactionMock } = vi.hoisted(() => ({
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
  transactionMock: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({
  db: { client: clientDb, order: orderDb, $transaction: transactionMock },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

const session = { user: { id: "user-a", businessId: "business-a" } };
const client = (id: string, name: string) => ({
  id, name, address: null, cellPhone: null, cuit: null, ivaCondition: null,
  email: null, balance: 0, date: new Date("2026-01-01"), last_update: new Date("2026-01-01"),
});

interface Actions {
  getClientsPage: (query?: unknown) => Promise<Record<string, unknown>>;
  createClient: (input: unknown) => Promise<Record<string, unknown>>;
  updateClient: (input: unknown) => Promise<Record<string, unknown>>;
  deleteClient: (input: unknown) => Promise<Record<string, unknown>>;
  updateClientBalance: (id: string, amount: number) => Promise<Record<string, unknown>>;
}

async function loadActions(): Promise<Actions> {
  return (await import("@/actions/clients")) as unknown as Actions;
}

describe("clients cursor loader and authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue(session);
    clientDb.findMany.mockResolvedValue([]);
    clientDb.findFirst.mockResolvedValue(null);
    clientDb.findUnique.mockResolvedValue(null);
    transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({ client: clientDb, order: orderDb }));
    orderDb.count.mockResolvedValue(0);
  });

  it("returns an unauthorized result without querying when business context is absent", async () => {
    authMock.mockResolvedValue({ user: { id: "user-a" } });
    const result = await (await loadActions()).getClientsPage();
    expect(result).toMatchObject({ success: false, code: "UNAUTHORIZED" });
    expect(clientDb.findMany).not.toHaveBeenCalled();
  });

  it("loads a bounded first page with stable name/id ordering and an explicit select", async () => {
    clientDb.findMany.mockResolvedValue([client("1", "Ana"), client("2", "Beto")]);
    const result = await (await loadActions()).getClientsPage({ limit: 25 });
    expect(result).toMatchObject({ success: true, hasMore: expect.any(Boolean) });
    expect(clientDb.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { businessId: "business-a" },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: expect.any(Number),
      select: expect.objectContaining({ id: true, name: true, balance: true, last_update: true }),
    }));
    const query = clientDb.findMany.mock.calls[0][0] as { take?: number };
    expect(query.take).toBeGreaterThan(0);
    expect(query.take).toBeLessThanOrEqual(26);
  });

  it("exposes three cursor pages for 76 ordered records without repeating a record", async () => {
    const records = Array.from({ length: 76 }, (_, index) => client(String(index + 1), `Client ${String(index + 1).padStart(2, "0")}`));
    clientDb.findMany.mockImplementation(({ cursor }: { cursor?: { id: string } }) => {
      const start = cursor ? records.findIndex((item) => item.id === cursor.id) + 1 : 0;
      return Promise.resolve(records.slice(start, start + 26));
    });
    const actions = await loadActions();
    const first = await actions.getClientsPage({ limit: 25 });
    const second = await actions.getClientsPage({ limit: 25, cursor: first.nextCursor });
    const third = await actions.getClientsPage({ limit: 25, cursor: second.nextCursor });
    expect(first).toMatchObject({ clients: records.slice(0, 25), hasMore: true });
    expect(second).toMatchObject({ clients: records.slice(26, 51), hasMore: true });
    expect(third).toMatchObject({ clients: records.slice(52), hasMore: false, nextCursor: null });
    const loaded = [...(first.clients as unknown[]), ...(second.clients as unknown[]), ...(third.clients as unknown[])];
    expect(new Set(loaded.map((item) => (item as { id: string }).id)).size).toBe(76);
  });

  it("applies one normalized case-insensitive search across name, phone, email, and CUIT", async () => {
    await (await loadActions()).getClientsPage({ search: "  ANA  ", cursor: "opaque-cursor" });
    const query = clientDb.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(query.where).toMatchObject({ businessId: "business-a" });
    expect(query.where).toHaveProperty("OR");
    expect(query.where.OR).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: expect.objectContaining({ contains: "ANA", mode: "insensitive" }) }),
      expect.objectContaining({ cellPhone: expect.objectContaining({ contains: "ANA", mode: "insensitive" }) }),
      expect.objectContaining({ email: expect.objectContaining({ contains: "ANA", mode: "insensitive" }) }),
      expect.objectContaining({ cuit: expect.objectContaining({ contains: "ANA", mode: "insensitive" }) }),
    ]));
  });

  it("rejects malformed cursors and limits outside 1..50 without touching the database", async () => {
    const actions = await loadActions();
    const invalidCursor = await actions.getClientsPage({ cursor: "not-a-valid-cursor" });
    const invalidLimit = await actions.getClientsPage({ limit: 51 });
    expect(invalidCursor).toMatchObject({ success: false, code: "VALIDATION" });
    expect(invalidLimit).toMatchObject({ success: false, code: "VALIDATION" });
    expect(clientDb.findMany).not.toHaveBeenCalled();
  });

  it("uses ownership lookup before update and updates by the unique id only", async () => {
    clientDb.findFirst.mockResolvedValue({ id: "client-a", businessId: "business-a" });
    clientDb.update.mockResolvedValue(client("client-a", "Ana nueva"));
    const result = await (await loadActions()).updateClient({ id: "client-a", name: "Ana nueva" });
    expect(result.success).toBe(true);
    expect(clientDb.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "client-a", businessId: "business-a" } }));
    expect(clientDb.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "client-a" } }));
  });

  it("does not mutate a foreign client, including balance changes", async () => {
    clientDb.findFirst.mockResolvedValue(null);
    clientDb.findUnique.mockResolvedValue(null);
    const actions = await loadActions();
    expect(await actions.updateClient({ id: "client-b", name: "Intruso" })).toMatchObject({ success: false });
    expect(await actions.updateClientBalance("client-b", 10)).toMatchObject({ success: false });
    expect(clientDb.update).not.toHaveBeenCalled();
  });

  it("rejects protected create fields instead of silently accepting browser authorization data", async () => {
    const result = await (await loadActions()).createClient({ name: "Nueva", businessId: "business-b", balance: 99 });
    expect(result).toMatchObject({ success: false, code: "VALIDATION" });
    expect(clientDb.create).not.toHaveBeenCalled();
  });

  it("returns CONFLICT transactionally when historical orders exist", async () => {
    clientDb.findFirst.mockResolvedValue({ id: "client-a" });
    orderDb.count.mockResolvedValue(1);
    const result = await (await loadActions()).deleteClient({ id: "client-a" });
    expect(result).toMatchObject({ success: false, code: "CONFLICT" });
    expect(clientDb.delete).not.toHaveBeenCalled();
  });
});
