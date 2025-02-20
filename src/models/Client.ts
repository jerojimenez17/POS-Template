import Order from "./Order";

export default class Client {
  id = "";
  name = "";
  address = "";
  cellPhone = 0;
  date = new Date();
  last_update = new Date();
  orders: Order[] = [];
  balance: number = 0;
}
