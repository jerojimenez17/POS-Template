import { PaidStatus, Status } from "@/models/Order";
import * as z from "zod";

// const MAX_UPLOAD_SIZE = 1024 * 1024 * 3; // 3MB
// const ACCEPTED_FILE_TYPES = ["image/png"];

export const LoginSchema = z.object({
  email: z.string().email({ message: "Email es obligatorio" }),
  password: z.string().min(1, {
    message: "Contraseña es obligatorio",
  }),
});
export const RegisterSchema = z.object({
  email: z.string().email({ message: "Email es obligatorio" }),
  password: z.string().min(6, {
    message: "6 caracteres minimo",
  }),
  name: z.string().min(1, {
    message: "Nombre es obligatorio",
  }),
});
export const UnitsSchema = z.object({
  amount: z.number().min(1, { message: "La cantidad es obligatoria" }),
});
export const SuplierSchema = z.object({
  id: z.string(),
  name: z.string().min(1, { message: "Nombre es Obligatorio" }),
  phone: z.string(),
  email: z.string(),
  bonus: z.coerce.number(),
  creation_date: z.date(),
});
export const ProductSchema = z.object({
  id: z.string(),
  code: z.string().min(1, { message: "Codigo es obligatorio" }),
  description: z.string().min(1, {
    message: "Descripcion es obligatoria",
  }),
  price: z.coerce.number({
    required_error: "Precio es requerido",
    invalid_type_error: "Debe ser un numero",
  }),
  gain: z.coerce.number({
    invalid_type_error: "Debe ser un numero",
  }),
  salePrice: z.coerce.number(),
  suplier: z.string().optional(),
  client_bonus: z.coerce.number(),
  brand: z.string(),
  imageName: z.string(),
  // peso: z.string(),
  // medidas: z.string(),
  // color: z.string(),
  image: z.union([
    z.any(),
    z.string(), // Para cuando image es una URL
    typeof window === "undefined" ? z.any() : z.instanceof(FileList).optional(), // Para cuando estás en el navegador y necesitas un FileList
  ]),
  last_update: z.any(),
  creation_date: z.any(),
  category: z.string(),
  subCategory: z.string(),
  // .any()
  // .refine((file) => {
  //   return !file || file.size <= MAX_UPLOAD_SIZE;
  // }, "File size must be less than 3MB")
  // .refine((file) => {
  //   return ACCEPTED_FILE_TYPES.includes(file.type);
  // }, "El archivo debe ser PDF o PNG")
  // .optional(),
  amount: z.coerce.number({
    required_error: "Cantidad es requerido",
    invalid_type_error: "Debe ser un numero",
  }),
  unit: z.string(),
});
export const ClientSchema = z.object({
  id: z.string(),
  name: z.string().min(1, {
    message: "Nombre es obligatorio",
  }),
  cellPhone: z.coerce.number(),
  address: z.string(),
  date: z.date(),
  last_update: z.date(),
  orders: z.array(
    z.object({
      products: z.array(ProductSchema),
      status: z.enum([Status.pendiente, Status.confirmado, Status.entregado]),
      paidStatus: z.enum([PaidStatus.pago, PaidStatus.inpago]),

      id: z.string(),
      date: z.date(),
    })
  ),
  balance: z.coerce.number(),
});

export const BillParametersSchema = z.object({
  clientCondition: z.string(),
  paidMethod: z.string(),
  twoMethods: z.boolean(),
  discount: z.coerce.number(),
  CUIT: z.coerce.number().optional(),
  DNI: z.coerce.number().optional(),
  secondPaidMethod: z.string().optional(),
  totalSecondMethod: z.coerce.number().optional(),
});
