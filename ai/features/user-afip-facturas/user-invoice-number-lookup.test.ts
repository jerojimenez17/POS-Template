import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, businessFindUniqueMock, fetchMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  businessFindUniqueMock: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/db", () => ({ db: { business: { findUnique: businessFindUniqueMock } } }));

import { getVoucherNumberAction } from "@/actions/voucher";
import { getVoucherNumberForActor } from "@/lib/server/arca-billing";

const sessionUser = (role = "USER", businessId: string | null = "session-business") => ({
  id: "session-user",
  role,
  businessId,
});

describe("USER invoice-number preview authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("AFIP_SDK_ACCESS_TOKEN", "test-token");
    vi.stubEnv("INTERNAL_AFIP_API_KEY", "test-internal-key");
    vi.stubEnv("NEXT_PUBLIC_GET_LAST_VOUCHER_URL", "https://arca.example.test/last-voucher");
    vi.stubGlobal("fetch", fetchMock);
    authMock.mockResolvedValue({ user: sessionUser() });
    businessFindUniqueMock.mockResolvedValue({
      cuit: "20123456789",
      cert: "encrypted-cert",
      key: "encrypted-key",
      ptoVenta: [3],
      features: { hasAfipBilling: true },
    });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(JSON.stringify({ lastVoucher: 76 })),
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("allows USER preview with the existing two-argument action and session tenant", async () => {
    expect(getVoucherNumberAction.length).toBe(2);

    const result = await getVoucherNumberAction(3, 6);

    expect(result).toEqual({ success: 76 });
    expect(businessFindUniqueMock).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "session-business" } }));
    expect(businessFindUniqueMock).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({ features: { select: { hasAfipBilling: true } } }),
    }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({ action: "getLastVoucher", puntoVenta: 3, tipoFactura: 6 });
  });

  it.each([
    ["missing session", null],
    ["missing business", { user: sessionUser("USER", null) }],
    ["missing user id", { user: { ...sessionUser(), id: undefined } }],
    ["unsupported role", { user: sessionUser("CASHIER") }],
  ])("rejects a preview request with %s before looking up a tenant", async (_case, session) => {
    authMock.mockResolvedValue(session);

    const result = await getVoucherNumberAction(3, 6);

    expect(result).toHaveProperty("error");
    expect(businessFindUniqueMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows USER only invoice operation in the shared voucher lookup", async () => {
    const result = await getVoucherNumberForActor(3, 6, "invoice", {
      businessId: "session-business",
      role: "USER",
    });

    expect(result).toEqual({ success: 76 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([1, 6, 11])("allows configured USER invoice voucher type %s", async (voucherType) => {
    const result = await getVoucherNumberForActor(3, voucherType, "invoice", {
      businessId: "session-business",
      role: "USER",
    });

    expect(result).toEqual({ success: 76 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({ puntoVenta: 3, tipoFactura: voucherType });
  });

  it.each([
    ["disabled", { hasAfipBilling: false }],
    ["missing", undefined],
  ])("denies USER invoice preview when persisted entitlement is %s without contacting ARCA", async (_case, features) => {
    businessFindUniqueMock.mockResolvedValue({
      cuit: "20123456789",
      cert: "encrypted-cert",
      key: "encrypted-key",
      ptoVenta: [3],
      ...(features === undefined ? {} : { features }),
    });

    const result = await getVoucherNumberForActor(3, 6, "invoice", {
      businessId: "session-business",
      role: "USER",
    });

    expect(result).toHaveProperty("error");
    expect(businessFindUniqueMock).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "session-business" } }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["unconfigured point of sale", 9, 6],
    ["credit-note voucher type", 3, 3],
  ])("rejects a USER invoice preview with %s before contacting ARCA", async (_case, pointOfSale, voucherType) => {
    const result = await getVoucherNumberForActor(pointOfSale, voucherType, "invoice", {
      businessId: "session-business",
      role: "USER",
    });

    expect(result).toHaveProperty("error");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("denies USER credit-note sequence lookup before tenant reads or ARCA calls", async () => {
    const result = await getVoucherNumberForActor(3, 3, "credit-note", {
      businessId: "session-business",
      role: "USER",
    });

    expect(result).toEqual({ error: "No autorizado" });
    expect(businessFindUniqueMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("continues to allow administrator credit-note sequence lookup", async () => {
    const result = await getVoucherNumberForActor(3, 3, "credit-note", {
      businessId: "admin-business",
      role: "ADMIN",
    });

    expect(result).toEqual({ success: 76 });
    expect(businessFindUniqueMock).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "admin-business" } }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps unsupported roles denied in the shared lookup", async () => {
    const result = await getVoucherNumberForActor(3, 6, "invoice", {
      businessId: "session-business",
      role: "CASHIER",
    });

    expect(result).toEqual({ error: "No autorizado" });
    expect(businessFindUniqueMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
