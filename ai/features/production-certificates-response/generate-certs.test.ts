import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserRole } from "@prisma/client";

import { auth } from "../../../auth";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/encryption";
import { generateCertsAction } from "@/actions/generate-certs";
import { revalidateTag } from "next/cache";

vi.mock("../../../auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: { business: { update: vi.fn() } },
}));
vi.mock("@/lib/encryption", () => ({ encrypt: vi.fn((value: string) => `encrypted:${value}`) }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));

const CERT = "-----BEGIN CERTIFICATE-----\nCERT-SECRET\n-----END CERTIFICATE-----";
const KEY = "-----BEGIN PRIVATE KEY-----\nKEY-SECRET\n-----END PRIVATE KEY-----";
const BUSINESS_ID = "business-target";

const responseWith = (payload: unknown, ok = true, status = 200): Response => ({
  ok,
  status,
  json: vi.fn().mockResolvedValue(payload),
  text: vi.fn().mockResolvedValue("provider error body"),
} as unknown as Response);

describe("generateCertsAction: respuesta PROD y persistencia segura", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("INTERNAL_AFIP_API_KEY", "internal-test-key");
    vi.stubEnv("AFIP_SDK_ACCESS_TOKEN", "sdk-test-token");
    vi.mocked(auth).mockResolvedValue({
      user: { id: "admin-1", role: UserRole.ADMIN, businessId: BUSINESS_ID },
      expires: "2099-01-01",
    } as never);
    vi.mocked(db.business.update).mockResolvedValue({ id: BUSINESS_ID } as never);
  });

  it.each([
    ["directa", { cert: CERT, key: KEY }],
    ["data", { data: { cert: CERT, key: KEY } }],
    ["data.data", { data: { data: { cert: CERT, key: KEY } } }],
    ["success.data", { success: true, data: { cert: CERT, key: KEY } }],
    ["success.data.data", { success: true, data: { data: { cert: CERT, key: KEY } } }],
  ])("acepta la forma %s y actualiza una vez el negocio objetivo", async (_name, payload) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseWith(payload)));

    const result = await generateCertsAction("prod", "20123456789", "user", "password", "afipsdk", BUSINESS_ID);

    expect(result).toEqual({ success: expect.any(String) });
    expect(db.business.update).toHaveBeenCalledTimes(1);
    expect(db.business.update).toHaveBeenCalledWith({
      where: { id: BUSINESS_ID },
      data: { cert: `encrypted:${CERT}`, key: `encrypted:${KEY}` },
    });
    expect(encrypt).toHaveBeenCalledWith(CERT);
    expect(encrypt).toHaveBeenCalledWith(KEY);
    expect(revalidateTag).toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain(CERT);
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it("selecciona endpoints distintos y conserva el endpoint correspondiente a cada modo", async () => {
    const DEV_URL = "https://dev-certificates.example.test/generate";
    const PROD_URL = "https://prod-certificates.example.test/generate";
    const fetchMock = vi.fn().mockResolvedValue(responseWith({ cert: CERT, key: KEY }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("NEXT_PUBLIC_GET_ARCA_TEST_CERTS_URL", DEV_URL);
    vi.stubEnv("NEXT_PUBLIC_CREATE_CERT_PROD_URL", PROD_URL);

    const devResult = await generateCertsAction(
      "dev",
      "20123456789",
      "user",
      "password",
      "afipsdk",
      BUSINESS_ID
    );
    const prodResult = await generateCertsAction(
      "prod",
      "20123456789",
      "user",
      "password",
      "afipsdk",
      BUSINESS_ID
    );

    expect(devResult.success).toEqual(expect.any(String));
    expect(prodResult.success).toEqual(expect.any(String));
    expect(fetchMock).toHaveBeenNthCalledWith(1, DEV_URL, expect.any(Object));
    expect(fetchMock).toHaveBeenNthCalledWith(2, PROD_URL, expect.any(Object));
    expect(DEV_URL).not.toBe(PROD_URL);
  });

  it.each([
    ["success false", { success: false, data: { cert: CERT, key: KEY } }],
    ["sólo cert", { cert: CERT }],
    ["sólo key", { key: KEY }],
    ["cert vacío", { cert: "   ", key: KEY }],
    ["key vacío", { cert: CERT, key: "\n" }],
    ["tipos no string", { cert: { value: CERT }, key: [KEY] }],
    ["null", null],
  ])("rechaza %s sin sobrescribir credenciales", async (_name, payload) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseWith(payload)));

    const result = await generateCertsAction("prod", "20123456789", "user", "password", "afipsdk", BUSINESS_ID);

    expect(result.error).toEqual(expect.any(String));
    expect(result.success).toBeUndefined();
    expect(db.business.update).not.toHaveBeenCalled();
    expect(encrypt).not.toHaveBeenCalled();
  });

  it("no escribe ante HTTP no exitoso y no expone el body crudo", async () => {
    const fetchMock = vi.fn().mockResolvedValue(responseWith({ ignored: true }, false, 502));
    vi.stubGlobal("fetch", fetchMock);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await generateCertsAction("prod", "20123456789", "user", "password", "afipsdk", BUSINESS_ID);

    expect(result.error).toMatch(/502/);
    expect(result.error).not.toContain("provider error body");
    expect(errorSpy.mock.calls.flat().join(" ")).not.toContain("provider error body");
    expect(db.business.update).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it.each([
    ["JSON inválido", vi.fn().mockRejectedValue(new SyntaxError("invalid JSON"))],
    ["timeout", vi.fn().mockRejectedValue(new Error("timeout"))],
  ])("devuelve error de comunicación ante %s sin escribir", async (_name, json) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json }));

    const result = await generateCertsAction("prod", "20123456789", "user", "password", "afipsdk", BUSINESS_ID);

    expect(result).toEqual({ error: "Error al comunicarse con el servidor de certificados" });
    expect(db.business.update).not.toHaveBeenCalled();
  });

  it("no llama al proveedor ni escribe si un ADMIN apunta a otro negocio", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateCertsAction("prod", "20123456789", "user", "password", "afipsdk", "other-business");

    expect(result).toEqual({ error: "No autorizado para modificar otro negocio" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.business.update).not.toHaveBeenCalled();
  });

  it.each([
    ["sin sesión", null],
    ["rol inválido", { user: { id: "user-1", role: UserRole.USER, businessId: BUSINESS_ID }, expires: "2099-01-01" }],
  ])("no llama al proveedor ni escribe con %s", async (_name, session) => {
    vi.mocked(auth).mockResolvedValue(session as never);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateCertsAction("prod", "20123456789", "user", "password", "afipsdk", BUSINESS_ID);

    expect(result).toEqual({ error: "No autorizado" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.business.update).not.toHaveBeenCalled();
  });

  it("no anuncia éxito si falla la escritura", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responseWith({ cert: CERT, key: KEY })));
    vi.mocked(db.business.update).mockRejectedValue(new Error("database unavailable"));

    const result = await generateCertsAction("prod", "20123456789", "user", "password", "afipsdk", BUSINESS_ID);

    expect(result.success).toBeUndefined();
    expect(result.error).toEqual("Error al guardar los certificados en la base de datos");
    expect(JSON.stringify(result)).not.toContain(CERT);
    expect(JSON.stringify(result)).not.toContain(KEY);
  });
});
