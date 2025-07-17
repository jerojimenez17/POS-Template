import moment from "moment";
import Product from "./Product";

export class ProductAccount extends Product {
  date: moment.Moment;
  amount: number;
  constructor(product: Product, amount: number, date: moment.Moment) {
    super();
    this.id = product.id;
    this.code = product.code;
    this.description = product.description;
    this.brand = product.brand;
    this.subCategory = product.subCategory;
    this.price = product.price;
    this.salePrice = product.salePrice;
    this.gain = product.gain;
    this.suplier = product.suplier;
    this.client_bonus = product.client_bonus;
    this.unit = product.unit;
    this.image = product.image;
    this.imageName = product.imageName;
    // this.peso = product.peso;
    // this.medidas = product.medidas;
    // this.color = product.color;
    this.amount = amount;
    this.date = date;
    this.amount = amount;
  }
}

export default class Account {
  id = "";
  clientName = "";
  clientEmail = "";
  clientPhone = "";
  productsAccount: ProductAccount[] = [];
  total = 0;
  date = moment();
  last_update = moment();
  status = "pending";

  constructor(
    id?: string,
    clientName?: string,
    clientEmail?: string,
    clientPhone?: string,
    productsAccount?: ProductAccount[],
    date?: moment.Moment,
    last_update?: moment.Moment,
    status?: string
  ) {
    this.id = id || "";
    this.clientName = clientName || "";
    this.clientEmail = clientEmail || "";
    this.productsAccount = productsAccount || [];
    this.clientPhone = clientPhone || "";
    this.date = date || moment();
    this.last_update = last_update || moment();
    this.status = status || "pending";
    this.total = productsAccount
      ? productsAccount.reduce((acc, p) => acc + p.amount * p.salePrice, 0)
      : 0;
  }
}
