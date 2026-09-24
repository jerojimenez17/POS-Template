import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  normalizeAuthorizedFiscalSnapshot,
  type AuthorizedFiscalSnapshotV1,
  type OriginalBillType,
} from "@/services/afip/credit-note";

const GRANT_TTL_MS = 30 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createAuthorizedFiscalSnapshotGrant(
  businessId: string,
  cae: string,
  snapshot: AuthorizedFiscalSnapshotV1,
  metadata: { billType: OriginalBillType; invoiceNumber: number; pointOfSale: number },
): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const serializedSnapshot = JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonValue;
  await db.authorizedFiscalSnapshotGrant.create({
    data: {
      tokenHash: hashToken(token),
      businessId,
      cae,
      billType: metadata.billType,
      invoiceNumber: metadata.invoiceNumber,
      pointOfSale: metadata.pointOfSale,
      snapshot: serializedSnapshot,
      expiresAt: new Date(Date.now() + GRANT_TTL_MS),
    },
  });
  return token;
}

/** Consume a server-issued, tenant-bound, one-use grant inside the sale transaction. */
export async function consumeAuthorizedFiscalSnapshotGrant(
  tx: Prisma.TransactionClient,
  input: {
    token: string;
    businessId: string;
    cae: string;
    billType: OriginalBillType;
    invoiceNumber: number;
    pointOfSale: number;
    total: number;
  },
): Promise<AuthorizedFiscalSnapshotV1 | undefined> {
  if (!/^[a-f0-9]{64}$/.test(input.token)) return undefined;
  const tokenHash = hashToken(input.token);
  const grant = await tx.authorizedFiscalSnapshotGrant.findFirst({
    where: {
      tokenHash,
      businessId: input.businessId,
      cae: input.cae,
      billType: input.billType,
      invoiceNumber: input.invoiceNumber,
      pointOfSale: input.pointOfSale,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  if (!grant) return undefined;

  const snapshot = normalizeAuthorizedFiscalSnapshot(grant.snapshot, { total: input.total });
  if (!snapshot) return undefined;

  const claim = await tx.authorizedFiscalSnapshotGrant.updateMany({
    where: { id: grant.id, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  });
  return claim.count === 1 ? snapshot : undefined;
}
