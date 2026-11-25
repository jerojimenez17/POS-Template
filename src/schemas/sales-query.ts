import { z } from "zod";

const calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida").refine((value) => {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}, "Fecha inválida");

export const SalesQuerySchema = z.object({
  cursor: z.string().trim().min(1).optional(),
  take: z.number().int().min(1).max(100).optional(),
  from: calendarDateSchema.optional(),
  to: calendarDateSchema.optional(),
  seller: z.string().trim().min(1).max(100).optional(),
  documentTypes: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  paymentMethods: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
}).superRefine((value, context) => {
  if (value.from && value.to && value.from > value.to) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["to"], message: "El rango de fechas es inválido" });
  }
});

export type SalesQueryInput = z.input<typeof SalesQuerySchema>;
