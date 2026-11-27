import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { businessFindUniqueMock, fetchMock } = vi.hoisted(() => ({
  businessFindUniqueMock: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { business: { findUnique: businessFindUniqueMock } },
}));

import { getVoucherNumberForActor } from "@/lib/server/arca-billing";

const LOCAL_LAST_VOUCHER_URL = "http://127.0.0.1:5001/stockia-e90c6/us-central1/getLastVoucherHandler";
const actor = { businessId: "tenant-1", role: "ADMIN" };

describe("ARCA get-last-voucher transport URL selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_GET_LAST_VOUCHER_URL", undefined);
    vi.stubEnv("AFIP_SDK_ACCESS_TOKEN", "test-token");
    vi.stubEnv("INTERNAL_AFIP_API_KEY", "test-internal-key");
    vi.stubGlobal("fetch", fetchMock);
    businessFindUniqueMock.mockResolvedValue({
      cuit: "20123456789",
      cert: "encrypted-cert",
      key: "encrypted-key",
      ptoVenta: [9],
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
    vi.resetAllMocks();
  });

  it("fetches the local emulator fallback when the URL is unset", async () => {
    const result = await getVoucherNumberForActor(9, 6, "invoice", actor);

    expect(result).toEqual({ success: 76 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(LOCAL_LAST_VOUCHER_URL);
  });

  it("fetches the exact configured URL override", async () => {
    const overrideUrl = "https://billing-override.example.test/last-voucher?tenant=qa";
    vi.stubEnv("NEXT_PUBLIC_GET_LAST_VOUCHER_URL", overrideUrl);

    const result = await getVoucherNumberForActor(9, 6, "invoice", actor);

    expect(result).toEqual({ success: 76 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(overrideUrl);
  });
});
