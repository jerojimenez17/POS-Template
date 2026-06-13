import Product from "@/models/Product";
import BillState from "@/models/BillState";
import CAE from "@/models/CAE";

export type BillAction =
  | { type: "addItem"; payload: Product }
  | { type: "addUnit"; payload: Product }
  | { type: "removeUnit"; payload: { id: string } }
  | { type: "removeAll"; payload: null }
  | { type: "removeItem"; payload: { id: string } }
  | { type: "updateunit"; payload: { id: string } }
  | { type: "updateTotal"; payload: Product }
  | { type: "changePrice"; payload: Product }
  | { type: "changeUnit"; payload: Product }
  | { type: "total"; payload: null }
  | { type: "discount"; payload: number }
  | { type: "typeDocument"; payload: string }
  | { type: "documentNumber"; payload: number }
  | { type: "entrega"; payload: number }
  | { type: "nroAsociado"; payload: number }
  | { type: "sellerName"; payload: string }
  | { type: "IVACondition"; payload: string }
  | { type: "date"; payload: Date }
  | { type: "paidMethod"; payload: string }
  | { type: "billType"; payload: string }
  | { type: "CAE"; payload: CAE }
  | { type: "setState"; payload: BillState };
