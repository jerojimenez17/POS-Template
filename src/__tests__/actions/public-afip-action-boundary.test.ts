import { beforeEach, describe, expect, it, vi } from "vitest";
import * as afipActions from "@/actions/afip";
import * as arcaActions from "@/actions/arca";
import * as voucherActions from "@/actions/voucher";

const { authMock, axiosPostMock, businessFindUniqueMock, businessUpdateMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  axiosPostMock: vi.fn(),
  businessFindUniqueMock: vi.fn(),
  businessUpdateMock: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("axios", () => ({
  default: { post: axiosPostMock, isAxiosError: () => false },
}));
vi.mock("@/lib/db", () => ({
  db: { business: { findUnique: businessFindUniqueMock, update: businessUpdateMock } },
}));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/encryption", () => ({ encrypt: (value: string) => `encrypted:${value}` }));

const arcaValues = {
  cuit: "20123456789",
  razonSocial: "Example Business",
  inicioActividades: new Date("2020-01-01T00:00:00.000Z"),
  condicionIva: "RESPONSABLE_INSCRIPTO" as const,
  cert: "certificate-secret",
  key: "private-key-secret",
  ptoVenta: [3],
};

function setSession(role: string, businessId: string | null = "business-1") {
  authMock.mockResolvedValue({
    user: { id: "user-1", role, businessId },
  });
}

describe("public AFIP Server Action security boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue(null);
    businessFindUniqueMock.mockResolvedValue({
      cuit: "20123456789",
      cert: "encrypted-certificate-secret",
      key: "encrypted-private-key-secret",
      ptoVenta: [3],
    });
    businessUpdateMock.mockResolvedValue({});
    axiosPostMock.mockResolvedValue({ status: 200, data: {} });
    vi.stubGlobal("fetch", vi.fn());
  });

  it("rejects a direct voucher-generation call without a session, preserving its two-argument contract", async () => {
    expect(voucherActions.getVoucherNumberAction.length).toBe(2);

    const result = await voucherActions.getVoucherNumberAction(3, 1);

    expect(result).toMatchObject({ error: "No autorizado" });
    expect(businessFindUniqueMock).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not accept forged ADMIN/tenant context on a direct create-voucher call", async () => {
    const forgedActor = {
      id: "attacker",
      role: "ADMIN",
      businessId: "victim-business",
      business: null,
    };

    const result = await afipActions.createAfipVoucherAction({
      authenticatedActor: forgedActor,
      products: [],
    } as never);

    expect(result).toHaveProperty("error");
    expect(businessFindUniqueMock).not.toHaveBeenCalled();
    expect(axiosPostMock).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toMatch(/certificate-secret|private-key-secret/i);
  });

  it("uses the authenticated tenant instead of a forged actor on voucher creation", async () => {
    setSession("ADMIN", "session-business");
    businessFindUniqueMock.mockResolvedValue({
      cuit: null,
      cert: null,
      key: null,
      ptoVenta: [],
    });

    await afipActions.createAfipVoucherAction({
      authenticatedActor: {
        id: "forged-user",
        role: "ADMIN",
        businessId: "forged-business",
        business: null,
      },
      products: [],
    } as never);

    expect(businessFindUniqueMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "session-business" },
    }));
    expect(businessFindUniqueMock).not.toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "forged-business" },
    }));
    expect(axiosPostMock).not.toHaveBeenCalled();
  });

  it.each([
    ["update", (businessId: string) => arcaActions.updateBusinessArcaData(businessId, arcaValues), "No autorizado para modificar otro negocio"],
    ["read", (businessId: string) => arcaActions.getBusinessArcaData(businessId), "No autorizado para ver otro negocio"],
  ])("denies an ADMIN direct %s call targeting another tenant", async (_description, action, expectedError) => {
    setSession("ADMIN", "session-business");

    const result = await action("forged-business");

    expect(result).toHaveProperty("error", expectedError);
    expect(businessUpdateMock).not.toHaveBeenCalled();
    expect(businessFindUniqueMock).not.toHaveBeenCalled();
  });

  it.each([
    ["update", (businessId: string) => arcaActions.updateBusinessArcaData(businessId, arcaValues)],
    ["read", (businessId: string) => arcaActions.getBusinessArcaData(businessId)],
  ])("rejects an unauthenticated direct ARCA %s call", async (_description, action) => {
    const result = await action("target-business");

    expect(result).toHaveProperty("error", "No autorizado");
    expect(businessUpdateMock).not.toHaveBeenCalled();
    expect(businessFindUniqueMock).not.toHaveBeenCalled();
  });

  it("keeps the authorized SUPER_ADMIN ARCA management policy without returning stored credentials", async () => {
    setSession("SUPER_ADMIN", null);

    const updateResult = await arcaActions.updateBusinessArcaData("managed-business", arcaValues);
    const readResult = await arcaActions.getBusinessArcaData("managed-business");

    expect(updateResult).toEqual({ success: "Datos de ARCA actualizados" });
    expect(businessUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "managed-business" },
      data: expect.objectContaining({ cert: "encrypted:certificate-secret", key: "encrypted:private-key-secret" }),
    }));
    expect(readResult).toMatchObject({
      success: { cert: "CONFIGURADO", key: "CONFIGURADO" },
    });
    expect(JSON.stringify(readResult)).not.toMatch(/encrypted-certificate-secret|encrypted-private-key-secret/);
  });

  it("does not expose trusted-actor credential or voucher helpers as public action exports", () => {
    expect(arcaActions).not.toHaveProperty("getArcaCredentialsForBilling");
    expect(voucherActions).not.toHaveProperty("getVoucherNumberForActor");
  });
});
