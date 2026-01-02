import { DocumentData } from "firebase/firestore";
import BillState from "./BillState";
import { ProductFirebaseAdapter } from "./ProductFirebaseAdapter";
import Product from "./Product";

export class FirebaseAdapter {
  public static fromDocumentDataArray(data: DocumentData[]): BillState[] {
    const state: BillState[] = [];
    data.forEach((d) => {
      state.push(FirebaseAdapter.fromDocumentData(d.data(), d.id));
    });
    return state;
  }

  private static toPlainDate(val: Date | { seconds: number; nanoseconds?: number } | null | undefined): Date {
    if (!val) return new Date();
    if (val instanceof Date) return val;
    if (typeof val === "object" && "seconds" in val) {
      return new Date(val.seconds * 1000 + (val.nanoseconds || 0) / 1000000);
    }
    return new Date();
  }

  public static fromDocumentData(
    data: DocumentData,
    dataId: string
  ): BillState {
    const adaptedProducts = ProductFirebaseAdapter.forBill(data.products || []);
    const totalCalc = adaptedProducts.reduce(
      (acc: number, p: Product) => acc + (p.salePrice || p.price || 0) * (p.amount || 0),
      0
    );

    return {
      id: String(dataId),
      twoMethods: !!data.twoMethods,
      products: adaptedProducts,
      total: Number(data.total || totalCalc),
      totalWithDiscount:
        data.discount && data.discount !== 0 && data.discount !== null
          ? totalCalc - (totalCalc * Number(data.discount) * 0.01)
          : totalCalc,
      client: data.client ? String(data.client) : undefined,
      entrega: data.entrega !== undefined ? Number(data.entrega) : undefined,
      paidMethod: data.paidMethod ? String(data.paidMethod) : undefined,
      IVACondition: data.IVACondition ? String(data.IVACondition) : "Consumidor Final",
      tipoFactura: data.tipoFactura ? String(data.tipoFactura) : undefined,
      documentNumber: data.documentNumber !== undefined ? Number(data.documentNumber) : 0,
      typeDocument: data.typeDocument ? String(data.typeDocument) : "DNI",
      seller: data.seller ? String(data.seller) : "",
      discount: data.discount !== undefined ? Number(data.discount) : 0,
      CAE: data.CAE ? {
        CAE: String(data.CAE.CAE || ""),
        vencimiento: String(data.CAE.vencimiento || ""),
        nroComprobante: Number(data.CAE.nroComprobante || 0),
        qrData: String(data.CAE.qrData || "")
      } : undefined,
      date: FirebaseAdapter.toPlainDate(data.date),
      billType: data.billType ? String(data.billType) : undefined,
      nroAsociado: data.nroAsociado !== undefined ? Number(data.nroAsociado) : undefined,
    } as BillState;
  }
}
