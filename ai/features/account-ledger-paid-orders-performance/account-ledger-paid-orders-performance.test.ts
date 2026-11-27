import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { getUnpaidOrders } from "@/actions/unpaid-orders";
import { auth } from "@/auth";
import { db } from "@/lib/db";

const { authMock, orderFindManyMock, orderFindUniqueMock, requireFeatureMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  orderFindManyMock: vi.fn(),
  orderFindUniqueMock: vi.fn(),
  requireFeatureMock: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({
  db: {
    order: {
      findMany: orderFindManyMock,
      findUnique: orderFindUniqueMock,
    },
  },
}));
vi.mock("@/lib/auth-gates", () => ({
  requireFeature: requireFeatureMock,
  assertWritePermission: vi.fn(),
}));

const featureDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(featureDirectory, "..", "..", "..");

const orderFindMany = vi.mocked(db.order.findMany);
const orderFindUnique = vi.mocked(db.order.findUnique);
const authResultMock = vi.mocked(auth);

function listInput(overrides: Record<string, unknown> = {}) {
  // The search field is deliberately part of the RED contract before production
  // types are extended by the implementation step.
  return {
    businessId: "business-from-request",
    status: "pago",
    ...overrides,
  } as Parameters<typeof getUnpaidOrders>[0];
}

describe("account ledger paid-orders query contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireFeatureMock.mockResolvedValue({ success: true });
    authResultMock.mockResolvedValue({
      user: { businessId: "business-from-session" },
    } as never);
    orderFindMany.mockResolvedValue([]);
    orderFindUnique.mockResolvedValue(null);
  });

  it("filters paid orders while excluding pending orders", async () => {
    await getUnpaidOrders(listInput({ status: "pago" }));

    expect(orderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: "business-from-session",
          paidStatus: "pago",
          status: { not: "pendiente" },
        }),
      }),
    );
  });

  it.each([
    ["pendiente", { status: "pendiente" }, { status: "pendiente" }],
    ["inpago", { status: "inpago" }, { paidStatus: "inpago", status: { not: "pendiente" } }],
    ["pagado alias", { status: "pagado" }, { paidStatus: "pago", status: { not: "pendiente" } }],
    ["all", { status: "all" }, { status: { not: "pendiente" } }],
  ])("preserves the %s status where semantics", async (_label, input, expected) => {
    await getUnpaidOrders(listInput(input));

    expect(orderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining(expected) }),
    );
  });

  it("keeps the all-tab query tenant-scoped, status-scoped, and bounded", async () => {
    await getUnpaidOrders(listInput({ status: "all", limit: 25, cursor: null }));

    expect(orderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: "business-from-session",
          status: { not: "pendiente" },
        }),
        take: 26,
      }),
    );
  });

  it("keeps the paid-tab query tenant-scoped, paid-only, and bounded", async () => {
    await getUnpaidOrders(listInput({ status: "pago", limit: 25, cursor: null }));

    expect(orderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: "business-from-session",
          status: { not: "pendiente" },
          paidStatus: "pago",
        }),
        take: 26,
      }),
    );
  });

  it("pushes a non-empty client search into the relational Prisma where", async () => {
    await getUnpaidOrders(listInput({ search: " Ana " }));

    expect(orderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          client: { name: { contains: "Ana", mode: "insensitive" } },
        }),
      }),
    );
  });

  it("does not turn an empty or whitespace search into a client filter", async () => {
    await getUnpaidOrders(listInput({ search: "   " }));

    const query = orderFindMany.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(query.where).not.toHaveProperty("client");
  });

  it("uses only the account-ledger projection and never include: client", async () => {
    await getUnpaidOrders(listInput());

    const query = orderFindMany.mock.calls[0]?.[0] as {
      select?: Record<string, unknown>;
      include?: Record<string, unknown>;
    };
    expect(query.select).toEqual({
      id: true,
      date: true,
      total: true,
      status: true,
      paidStatus: true,
      clientId: true,
      notes: true,
      client: { select: { id: true, name: true, balance: true } },
    });
    expect(query).not.toHaveProperty("include");
  });

  it("requests deterministic client-name ordering with date descending tie-break", async () => {
    await getUnpaidOrders(listInput());

    expect(orderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: expect.arrayContaining([
          { client: { name: "asc" } },
          { date: "desc" },
        ]),
      }),
    );
  });

  it("uses the session business and rejects an input business when there is no business session", async () => {
    await getUnpaidOrders(listInput({ businessId: "attacker-business" }));
    expect(orderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ businessId: "business-from-session" }) }),
    );

    vi.clearAllMocks();
    authResultMock.mockResolvedValue(null as never);
    const result = await getUnpaidOrders(listInput({ businessId: "attacker-business" }));

    expect(result).toEqual({ success: false, error: "No autorizado" });
    expect(orderFindMany).not.toHaveBeenCalled();
  });

  it("denies a disabled plan before auth or any database call", async () => {
    requireFeatureMock.mockResolvedValue({
      success: false,
      error: "Esta función no está habilitada en tu plan actual.",
    });

    await expect(getUnpaidOrders(listInput())).resolves.toEqual({
      success: false,
      error: "Esta función no está habilitada en tu plan actual.",
    });
    expect(requireFeatureMock).toHaveBeenCalledWith("hasClientLedger");
    expect(authResultMock).not.toHaveBeenCalled();
    expect(orderFindMany).not.toHaveBeenCalled();
    expect(orderFindUnique).not.toHaveBeenCalled();
  });

  it("performs one set-based list query and no per-order detail queries", async () => {
    orderFindMany.mockResolvedValue([
      { id: "order-1" } as never,
      { id: "order-2" } as never,
    ]);

    const result = await getUnpaidOrders(listInput());

    expect(result.success).toBe(true);
    expect(orderFindMany).toHaveBeenCalledTimes(1);
    expect(orderFindUnique).not.toHaveBeenCalled();
  });

  it("keeps the ActionResult error contract when Prisma fails", async () => {
    orderFindMany.mockRejectedValue(new Error("database unavailable"));

    await expect(getUnpaidOrders(listInput())).resolves.toEqual({
      success: false,
      error: "database unavailable",
    });
  });
});

describe("account ledger page data-flow contract", () => {
  it("passes search to getUnpaidOrders instead of filtering every returned row", () => {
    const source = readFileSync(join(repositoryRoot, "src", "app", "(protected)", "account-ledger", "AccountLedgerContent.tsx"), "utf8");

    expect(source).toMatch(/getUnpaidOrders\(\{[\s\S]*?search\s*:\s*debouncedSearch/);
    expect(source).not.toMatch(/\borders\.filter\s*\(/);
  });
});
