import { doc, DocumentData, getDoc, Timestamp } from "firebase/firestore";
import Order from "./Order";
import noImg from "@/public/no-image.svg";
import { ClientFirebaseAdapter } from "./ClientFirebaseAdapter";
import { fbDB } from "@/firebase/config";
import { getClients } from "@/firebase/clients/getClient";
import Client from "./Client";
import Product from "./Product";

export class OrderFirebaseAdapter {
  public formated = async (d: DocumentData[]) => {};
  public static async fromDocumentDataArray(data: DocumentData[]) {
    const clients: Client[] = await getClients();
    let state: Order[] = [];
    for (let i = 0; i < data.length; i++) {
      let formatedData = OrderFirebaseAdapter.fromDocumentData(
        data[i].data(),
        data[i].id
      );
      console.log(clients);
      const foundClient = clients.find(
        (client) => formatedData.client.id === client.id
      );

      const formatedOrder = {
        ...formatedData,
        client: foundClient || new Client(),
      };
      state.push(formatedOrder);
    }
    console.log(state);
    return state;
  }

  public static fromDocumentData(data: DocumentData, dataId: string) {
    let order = new Order();
    order.seller = data.seller;
    order.status = data.status;
    order.id = dataId;
    order.products = data.products;

    // Manejo de diferentes formatos de fecha
    if (data.date instanceof Timestamp) {
      order.date = data.date.toDate(); // Si es un Timestamp de Firestore
    } else if (typeof data.date === "string") {
      order.date = new Date(data.date); // Si es un string ISO 8601
    } else {
      order.date = new Date(); // Valor por defecto en caso de fallo
    }
    order.paidStatus = data.paidStatus;
    order.total = data.products.reduce(
      (sum: number, product: Product) =>
        sum + product.salePrice * product.amount,
      0
    );
    order.client.id = data.client;
    return order;
  }
}
