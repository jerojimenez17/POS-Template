import { DocumentData } from "firebase/firestore";
import BillState from "./BillState";
import { ProductFirebaseAdapter } from "./ProductFirebaseAdapter";
import Product from "./Product";

export class FirebaseAdapter {
  public static fromDocumentDataArray(data: DocumentData[]): BillState[] {
    const state: BillState[] = [];
    data.forEach((d) => {
      console.log(d);
      state.push(FirebaseAdapter.fromDocumentData(d.data(), d.id));
    });
    return state;
  }

  public static fromDocumentData(
    data: DocumentData,
    dataId: string
  ): BillState {
    return {
      id: dataId,
      twoMethods: data.twoMethods,
      products: ProductFirebaseAdapter.forBill(data.products),
      total: data.total,
      totalWithDiscount:
        data.discount && data.discount !== 0 && data.discount !== null
          ? ProductFirebaseAdapter.forBill(data.products).reduce(
              (acc: number, p: Product) => acc + p.salePrice * p.amount,
              0
            ) -
            ProductFirebaseAdapter.forBill(data.products).reduce(
              (acc: number, p: Product) => acc + p.salePrice * p.amount,
              0
            ) *
              Number(data.discount) *
              0.01
          : ProductFirebaseAdapter.forBill(data.products).reduce(
              (acc: number, p: Product) => acc + p.salePrice * p.amount,
              0
            ),
      client: data.client,
      entrega: data.entrega,
      paidMethod: data.paidMethod,
      IVACondition: data.IVACondition,
      tipoFactura: data.tipoFactura,
      documentNumber: data.documentNumber,
      typeDocument: data.typeDocument,
      seller: data.seller,
      discount: data.discount,
      CAE: data.CAE,
      date:
        data.date &&
        new Date(data.date.seconds * 1000 + data.date.nanoseconds / 1000000),
    } as BillState;
  }
}
