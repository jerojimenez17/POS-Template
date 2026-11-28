import { describe, expect, it } from "vitest";
import { parseCAE } from "@/lib/cae";
import { buildPDFHTML } from "@/lib/print/pdf-templates";
import { parseAfipVoucherResponse } from "@/services/afip/voucher-response";

const VALID_CAE = "12345678901234";
const CONTEXT = { ptoVenta: 7, tipoFactura: 6 as const };

const successData = (parsed: ReturnType<typeof parseAfipVoucherResponse>) => {
  expect(parsed.kind).toBe("success");
  if (parsed.kind !== "success") throw new Error("Expected an authorized CAE response");
  return parsed.data;
};

describe("parseAfipVoucherResponse — AFIP/ARCA QR opaque-data contract", () => {
  it.each([
    ["direct", { CAE: VALID_CAE, qrData: "direct-qr" }, "direct"],
    ["afip", { afip: { CAE: VALID_CAE, qrData: "afip-qr" } }, "afip"],
    ["data", { data: { CAE: VALID_CAE, qrData: "data-qr" } }, "data"],
    ["data.afip", { data: { afip: { CAE: VALID_CAE, qrData: "nested-qr" } } }, "data.afip"],
    ["success direct", { success: true, data: { CAE: VALID_CAE, qrData: "success-qr" } }, "data"],
    ["success data.afip", { success: true, data: { afip: { CAE: VALID_CAE, qrData: "success-nested-qr" } } }, "data.afip"],
  ] as const)("supports the existing %s CAE response shape", (_name, payload, sourcePath) => {
    const data = successData(parseAfipVoucherResponse(payload, CONTEXT));

    expect(data).toMatchObject({ cae: VALID_CAE, sourcePath });
    expect(data.qrData).toBeTruthy();
  });

  it("preserves opaque QR text exactly without trimming, decoding, or re-encoding", () => {
    const opaqueQr = " https://arca.example/qr?p=A%2BB+%2F%3D%20x&data=eyJ4IjoiKy89In0= ";
    const data = successData(parseAfipVoucherResponse({ CAE: VALID_CAE, qrData: opaqueQr }, CONTEXT));

    expect(data.qrData).toBe(opaqueQr);
  });

  it("selects the CAE-node QR before wrapper and root QR consistently", () => {
    const payload = {
      success: true,
      data: {
        afip: { CAE: VALID_CAE, qrData: "node-qr" },
        qrData: "wrapper-qr",
      },
      qrData: "root-qr",
    };

    const selections = Array.from({ length: 5 }, () =>
      successData(parseAfipVoucherResponse(payload, CONTEXT)).qrData,
    );

    expect(selections).toEqual(Array(5).fill("node-qr"));
  });

  it("selects data wrapper QR before root QR for data.afip without success true", () => {
    const payload = {
      data: {
        afip: { CAE: VALID_CAE },
        qrData: "wrapper-qr",
      },
      qrData: "root-qr",
    };

    expect(successData(parseAfipVoucherResponse(payload, CONTEXT)).qrData).toBe("wrapper-qr");
  });

  it("falls back to root QR when data wrapper has no usable candidate", () => {
    const payload = {
      data: {
        afip: { CAE: VALID_CAE },
        qrData: { unexpected: true },
      },
      qrData: "root-qr",
    };

    expect(successData(parseAfipVoucherResponse(payload, CONTEXT)).qrData).toBe("root-qr");
  });

  it("falls back from a missing or unusable CAE-node QR to wrapper, then root", () => {
    const missingNode = {
      success: true,
      data: { afip: { CAE: VALID_CAE }, qrData: "wrapper-qr", },
      qrData: "root-qr",
    };
    const unusableWrapper = {
      success: true,
      data: { afip: { CAE: VALID_CAE, qrData: "   " }, qrData: { unexpected: true } },
      qrData: "root-qr",
    };

    expect(successData(parseAfipVoucherResponse(missingNode, CONTEXT)).qrData).toBe("wrapper-qr");
    expect(successData(parseAfipVoucherResponse(unusableWrapper, CONTEXT)).qrData).toBe("root-qr");
  });

  it.each([
    ["absent", undefined],
    ["empty string", ""],
    ["whitespace-only string", " \t\n "],
    ["null", null],
    ["number", 42],
    ["boolean", true],
    ["array", ["qr"]],
    ["object", { text: "qr" }],
  ] as const)("treats %s as absent without coercion and retains the CAE", (_name, invalidQr) => {
    const payload = {
      success: true,
      data: { afip: { CAE: VALID_CAE, qrData: invalidQr } },
    };
    const data = successData(parseAfipVoucherResponse(payload, CONTEXT));

    expect(data.cae).toBe(VALID_CAE);
    expect(data.qrData).toBe("");
    expect(data.qrData).not.toBe("null");
    expect(data.qrData).not.toBe("[object Object]");
  });

  it.each([
    ["empty string", ""],
    ["whitespace-only string", "   "],
    ["null", null],
    ["number", 42],
    ["boolean", false],
    ["array", []],
    ["object", {}],
  ] as const)("skips an unusable CAE-node QR (%s) when a wrapper string is available", (_name, invalidQr) => {
    const payload = {
      success: true,
      data: {
        afip: { CAE: VALID_CAE, qrData: invalidQr },
        qrData: "wrapper-qr",
      },
    };

    expect(successData(parseAfipVoucherResponse(payload, CONTEXT)).qrData).toBe("wrapper-qr");
  });

  it("does not accept a QR value as a substitute for an authorized CAE", () => {
    const parsed = parseAfipVoucherResponse({ success: true, data: { qrData: "qr-without-cae" } }, CONTEXT);

    expect(parsed.kind).toBe("missing-cae");
  });

  it("round-trips the exact QR and empty-QR marker through the historical CAE JSON parser", () => {
    const opaqueQr = "https://arca.example/qr?p=eyJ4IjoiKy89In0%3D+%2F=";
    const authorized = successData(parseAfipVoucherResponse({ CAE: VALID_CAE, qrData: opaqueQr }, CONTEXT));
    const persisted = JSON.stringify({
      CAE: authorized.cae,
      vencimiento: authorized.vencimiento,
      nroComprobante: authorized.nroComprobante,
      qrData: authorized.qrData,
    });
    const restored = parseCAE(persisted);
    const historicalWithoutQr = parseCAE(JSON.stringify({ CAE: VALID_CAE, qrData: "" }));

    expect(restored?.qrData).toBe(opaqueQr);
    expect(historicalWithoutQr).toMatchObject({ CAE: VALID_CAE, qrData: "" });
  });
});

describe("PDF invoice output when QR is unavailable", () => {
  const baseReceipt = {
    businessName: "Comercio QA",
    date: new Date("2026-01-15T12:00:00Z"),
    products: [],
    subtotal: 0,
    total: 0,
    billType: "Factura B",
    cae: { cae: VALID_CAE, vencimiento: "20261231", qrData: "" },
  };

  it("keeps the authorized CAE in the PDF and omits only the QR image", () => {
    const html = buildPDFHTML(baseReceipt, { qrSvgDataUrl: null });

    expect(html).toContain("Comprobante Autorizado");
    expect(html).toContain(VALID_CAE);
    expect(html).not.toContain('alt="QR"');
  });

  it("uses the provided generated QR image when the opaque QR is available", () => {
    const qrImage = "data:image/svg+xml;base64,PHN2Zy8+";
    const html = buildPDFHTML(
      { ...baseReceipt, cae: { ...baseReceipt.cae, qrData: "original-opaque-qr" } },
      { qrSvgDataUrl: qrImage },
    );

    expect(html).toContain(VALID_CAE);
    expect(html).toContain(`src="${qrImage}"`);
  });
});
