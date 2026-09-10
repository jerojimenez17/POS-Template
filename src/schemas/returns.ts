import { z } from "zod";

export const ReturnItemSchema = z.object({
  productId: z.string().cuid(),
  quantity: z.number().positive().refine((n) => Number.isFinite(n)),
  refundAmount: z.number().nonnegative(),
});

export const ProcessReturnSchema = z.object({
  orderId: z.string().cuid(),
  items: z.array(ReturnItemSchema).min(1, "Seleccione al menos un producto"),
  reason: z.string().trim().min(3, "Motivo mínimo 3 caracteres").max(500),
});

export type ProcessReturnInput = z.infer<typeof ProcessReturnSchema>;
export type ReturnItemInput = z.infer<typeof ReturnItemSchema>;
