import { z } from "zod";

export interface SupplierExcelColumnMapping {
  code: string;
  description: string;
  price: string;
  amount: string | null;
  brand: string | null;
  category: string | null;
  subCategory: string | null;
  codebar: string | null;
  iva: string | null;
}

export type EditableSupplierExcelColumnMapping = {
  [Field in keyof SupplierExcelColumnMapping]: string;
};

export const DEFAULT_SUPPLIER_EXCEL_COLUMN_MAPPING: EditableSupplierExcelColumnMapping = {
  code: "A",
  description: "B",
  price: "C",
  amount: "",
  brand: "",
  category: "",
  subCategory: "",
  codebar: "",
  iva: "",
};

export const isExcelColumnLetter = (value: string): boolean => {
  if (!/^[A-Z]+$/.test(value)) return false;

  let columnNumber = 0;
  for (const character of value) {
    columnNumber = columnNumber * 26 + character.charCodeAt(0) - 64;
  }

  return columnNumber <= 16_384;
};

const requiredColumnSchema = z
  .string()
  .transform((value) => value.trim().toUpperCase())
  .refine(isExcelColumnLetter, "Debe indicar una columna válida de Excel");

const optionalColumnSchema = z
  .union([z.string(), z.null()])
  .transform((value) => {
    if (value === null) return null;
    const normalized = value.trim().toUpperCase();
    return normalized === "" ? null : normalized;
  })
  .refine((value) => value === null || isExcelColumnLetter(value), "Debe indicar una columna válida de Excel");

export const supplierExcelColumnMappingSchema = z
  .object({
    code: requiredColumnSchema,
    description: requiredColumnSchema,
    price: requiredColumnSchema,
    amount: optionalColumnSchema,
    brand: optionalColumnSchema,
    category: optionalColumnSchema,
    subCategory: optionalColumnSchema,
    codebar: optionalColumnSchema,
    iva: optionalColumnSchema,
  })
  .strict();

export const normalizeSupplierExcelColumnMapping = (
  mapping: SupplierExcelColumnMapping,
): SupplierExcelColumnMapping => supplierExcelColumnMappingSchema.parse(mapping);

export const toEditableSupplierExcelColumnMapping = (
  mapping: SupplierExcelColumnMapping,
): EditableSupplierExcelColumnMapping => ({
  code: mapping.code,
  description: mapping.description,
  price: mapping.price,
  amount: mapping.amount ?? "",
  brand: mapping.brand ?? "",
  category: mapping.category ?? "",
  subCategory: mapping.subCategory ?? "",
  codebar: mapping.codebar ?? "",
  iva: mapping.iva ?? "",
});

export const toSupplierExcelColumnMapping = (
  mapping: EditableSupplierExcelColumnMapping,
): SupplierExcelColumnMapping => supplierExcelColumnMappingSchema.parse(mapping);
