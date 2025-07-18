import { Suplier } from "./Suplier";

export default class Product {
  id = "";
  code = "";
  description = "";
  brand = "";
  subCategory = "";
  price = 0.0;
  salePrice = 0.0;
  gain = 0.0;
  suplier = new Suplier();
  client_bonus = 0.0;
  unit = "unidades";
  image = "";
  imageName = "";
  // peso = "";
  // medidas = "";
  // color = "";
  amount: number = 0;
  last_update = new Date(Date.now());
  creation_date = new Date(Date.now());
  category = "";
}
