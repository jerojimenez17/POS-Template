import Product from "@/models/Product";
import Client from "./Client";

export enum Status {
  pendiente = "pendiente",
  confirmado = "confirmado",
  entregado = "entregado",
  consignacion = "consignacion",
}
export enum PaidStatus {
  pago = "pago",
  inpago = "inpago",
}

export default class Order {
  id = "";
  client: Client = {
    id: "",
    name: "",
    address: "",
    cellPhone: 0,
    date: new Date(),
    last_update: new Date(),
    orders: [],
    balance: 0,
  };
  products: Product[] = [];
  date = new Date();
  total = 0;
  status: Status = Status.confirmado;
  seller = "";
  paidStatus: PaidStatus = PaidStatus.inpago;

  // constructor(products: Product[], total: number, client: Client) {
  //   this.client = client;
  //   this.total = total;
  //   this.products = products;
  // }
}
