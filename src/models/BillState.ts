import CAE from "./CAE";
import Product from "./Product";

export default interface BillState {
  id: string;
  products: Product[];
  total: number;
  totalWithDiscount: number;
  seller: string;
  discount: number;
  date: Date | null;
  typeDocument: string;
  documentNumber: number;
  secondPaidMethod?: string;
  totalSecondMethod?: number | null;
  IVACondition: string;
  twoMethods: boolean;
  CAE?: CAE;
  entrega?: number;
  pago?: boolean;
  billType?: string;
  nroAsociado?: number;
  paidMethod?: string;
}
