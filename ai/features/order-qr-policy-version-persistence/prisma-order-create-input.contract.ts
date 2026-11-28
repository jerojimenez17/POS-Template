import type { Prisma } from "@prisma/client";

// `npx tsc --noEmit` must compile this against the generated client. If the
// generated Prisma metadata is stale or omits the canonical scalar, this fails.
export const orderCreateInputWithQrPolicyVersion: Prisma.OrderUncheckedCreateInput = {
  businessId: "generated-client-contract-business",
  qrDataPolicyVersion: 1,
};
