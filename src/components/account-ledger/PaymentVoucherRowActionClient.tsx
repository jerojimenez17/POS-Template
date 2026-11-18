"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  createOrRetryPaymentVoucherAction,
  getPaymentVoucherStatusAction,
  printPaymentVoucherAction,
} from "@/actions/payment-voucher";
import { formatInvoiceNumberFull } from "@/lib/utils/bill-type";
import { PaymentVoucherRowAction } from "./PaymentVoucherRowAction";

type VoucherStatus = "NOT_REQUIRED" | "MISSING" | "FAILED" | "PENDING" | "ISSUING" | "AUTHORIZED" | "UNKNOWN";

interface Props {
  cashMovementId: string;
  amount: number;
  status: VoucherStatus;
  proposedBillType?: string;
  configuredPtoVentas: number[];
  /** Accepts the legacy empty value only; fiscal Client data belongs to the account editor. */
  client?: null;
}

interface VoucherResolution {
  sourceStatus: VoucherStatus;
  status: VoucherStatus;
  proposedBillType?: string;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}

function formatAmount(amount: number): string {
  return new Intl.NumberFormat("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(amount));
}

export function PaymentVoucherRowActionClient({ cashMovementId, amount, status, proposedBillType, configuredPtoVentas }: Props) {
  const router = useRouter();
  const [resolution, setResolution] = useState<VoucherResolution | null>(null);
  const [statusErrorKey, setStatusErrorKey] = useState<string | null>(null);
  const [statusReadAttempt, setStatusReadAttempt] = useState(0);
  const currentStatusKey = `${cashMovementId}:${status}`;
  const effectiveStatus = resolution?.sourceStatus === status ? resolution.status : status;
  const effectiveProposedBillType = resolution?.sourceStatus === status
    ? resolution.proposedBillType
    : proposedBillType;

  useEffect(() => {
    if (status !== "PENDING" && status !== "ISSUING") return;
    let active = true;
    void getPaymentVoucherStatusAction({ cashMovementId }).then((voucher) => {
      if (!active) return;
      if (!voucher || typeof voucher.status !== "string" || !["NOT_REQUIRED", "MISSING", "FAILED", "PENDING", "ISSUING", "AUTHORIZED", "UNKNOWN"].includes(voucher.status)) {
        setStatusErrorKey(currentStatusKey);
        return;
      }
      setStatusErrorKey(null);
      setResolution({
        sourceStatus: status,
        status: voucher.status as VoucherStatus,
        ...(voucher.status === "FAILED" && typeof voucher.proposedBillType === "string"
          ? { proposedBillType: voucher.proposedBillType }
          : {}),
      });
    }).catch(() => {
      if (active) setStatusErrorKey(currentStatusKey);
    });
    return () => { active = false; };
  }, [cashMovementId, currentStatusKey, status, statusReadAttempt]);

  const createOrRetry = async (input: { cashMovementId: string; billType: string; ptoVenta: number }) => {
    const result = await createOrRetryPaymentVoucherAction({
      ...input,
      retry: effectiveStatus === "FAILED",
    });
    if (result.voucherStatus === "FAILED" || result.voucherStatus === "UNKNOWN") {
      setResolution({
        sourceStatus: status,
        status: result.voucherStatus,
        ...(result.voucherStatus === "FAILED" ? { proposedBillType: input.billType } : {}),
      });
      router.refresh();
      return result.voucherStatus;
    }
    router.refresh();
  };

  const print = async () => {
    const popup = window.open("", "_blank");
    if (!popup) throw new Error("payment_voucher_print_unavailable");
    try {
    const voucher = await printPaymentVoucherAction({ cashMovementId });
    if (!voucher) {
      throw new Error("payment_voucher_print_unavailable");
    }
    const snapshot = typeof voucher.fiscalSnapshot === "object" && voucher.fiscalSnapshot !== null
      ? voucher.fiscalSnapshot as Record<string, unknown>
      : {};
    const recipient = typeof voucher.recipient === "object" && voucher.recipient !== null
      ? voucher.recipient as Record<string, unknown>
      : {
          name: snapshot.client,
          ivaCondition: snapshot.clientIvaCondition,
          documentType: null,
          documentNumber: null,
        };
    let qrImage = "";
    if (typeof voucher.qrData === "string" && voucher.qrData) {
      try {
        const QRCode = (await import("qrcode")).default;
        qrImage = await QRCode.toDataURL(voucher.qrData);
      } catch {
        throw new Error("payment_voucher_print_unavailable");
      }
    }
    const total = typeof voucher.total === "number" ? voucher.total : amount;
    const pointOfSale = Number(voucher.pointOfSale);
    const invoiceNumber = Number(voucher.invoiceNumber);
    const formattedInvoiceNumber = formatInvoiceNumberFull(invoiceNumber, pointOfSale);
    if (!formattedInvoiceNumber) throw new Error("payment_voucher_print_unavailable");
    const dateValue = voucher.issuedAt;
    const issuedDate = dateValue instanceof Date ? dateValue : typeof dateValue === "string" ? new Date(dateValue) : null;
    const issuedAt = issuedDate && !Number.isNaN(issuedDate.getTime()) ? issuedDate.toLocaleString("es-AR") : "";
    const documentType = typeof recipient.documentType === "string" ? recipient.documentType : "";
    const documentNumber = typeof recipient.documentNumber === "string" ? recipient.documentNumber : "";
    popup.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Factura ${escapeHtml(voucher.billType)}</title><style>body{font:14px Arial,sans-serif;max-width:720px;margin:32px auto;color:#111}header,footer{border-bottom:1px solid #bbb;padding:12px 0}footer{border:0;border-top:1px solid #bbb}table{width:100%;border-collapse:collapse;margin:24px 0}th,td{text-align:left;padding:10px;border-bottom:1px solid #ddd}.amount{text-align:right}.qr{width:110px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px}.total{font-weight:bold;font-size:18px;text-align:right}</style></head><body><header><h1>${escapeHtml(voucher.billType)}</h1><p>Factura ${escapeHtml(formattedInvoiceNumber)}</p><p>Fecha: ${escapeHtml(issuedAt)}</p></header><section class="meta"><p>Cliente: ${escapeHtml(recipient.name)}</p><p>Condición IVA: ${escapeHtml(recipient.ivaCondition)}</p>${documentType && documentNumber ? `<p>Documento: ${escapeHtml(documentType)} ${escapeHtml(documentNumber)}</p>` : ""}<p>CAE: ${escapeHtml(voucher.cae)}</p><p>Vencimiento CAE: ${escapeHtml(voucher.caeVencimiento)}</p></section><table><thead><tr><th>Descripción</th><th>Cantidad</th><th class="amount">Importe</th></tr></thead><tbody><tr><td>Pago parcial</td><td>1</td><td class="amount">$${formatAmount(total)}</td></tr></tbody></table><p class="total">Total: $${formatAmount(total)}</p><footer>${qrImage ? `<img class="qr" alt="Código QR del comprobante" src="${qrImage}">` : ""}</footer><script>window.onload=()=>window.print()</script></body></html>`);
    popup.document.close();
    } catch {
      popup.close();
      throw new Error("payment_voucher_print_unavailable");
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <PaymentVoucherRowAction
        cashMovementId={cashMovementId}
        amount={amount}
        status={effectiveStatus}
        proposedBillType={effectiveStatus === "FAILED" ? effectiveProposedBillType : undefined}
        configuredPtoVentas={configuredPtoVentas}
        onCreateOrRetry={createOrRetry}
        onPrint={print}
      />
      {statusErrorKey === currentStatusKey && (
        <div className="flex flex-col items-end gap-1" role="alert">
          <p className="text-xs text-destructive">No se pudo consultar el estado de la factura.</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setStatusErrorKey(null);
              setStatusReadAttempt((attempt) => attempt + 1);
            }}
          >
            Reintentar consulta
          </Button>
        </div>
      )}
    </div>
  );
}
