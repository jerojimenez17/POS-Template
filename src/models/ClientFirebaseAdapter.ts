import { DocumentData } from "firebase/firestore";
import Client from "./Client";

export class ClientFirebaseAdapter {
  public static fromDocumentDataArray(data: DocumentData[]): Client[] {
    let state: Client[] = [];
    data.forEach((d) => {
      state.push(ClientFirebaseAdapter.fromDocumentData(d.data(), d.id));
    });
    return state;
  }

  public static fromDocumentData(data: DocumentData, dataId: string): Client {
    let client = new Client();
    client.id = dataId;
    data.name ? (client.name = data.name) : (client.name = "");
    data.address ? (client.address = data.address) : (client.address = "");
    data.number ? (client.cellPhone = data.cellPhone) : (client.cellPhone = 0);
    data.cod ? (client.orders = data.orders) : (client.orders = []);
    data.balance ? (client.balance = data.balance) : (client.balance = 0);
    data.last_update
      ? (client.last_update = data.last_update)
      : (client.last_update = new Date());

    return client;
  }
}
