import type CAE from "@/models/CAE";

export const parseCAE = (value: unknown): CAE | undefined => {
  if (!value) return undefined;
  if (typeof value === "object" && value !== null) return value as CAE;
  return undefined;
};
