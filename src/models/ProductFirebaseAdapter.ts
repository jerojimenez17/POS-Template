/* eslint-disable @typescript-eslint/no-unused-expressions */
import { DocumentData, Timestamp } from "firebase/firestore";
import Product from "./Product";
import { Suplier } from "./Suplier";

export class ProductFirebaseAdapter {
  public static fromDocumentDataArray(data: DocumentData[]): Product[] {
    const state: Product[] = [];
    data.forEach((d) => {
      state.push({
        ...ProductFirebaseAdapter.fromDocumentData(d.data(), d.id),
      });
    });
    console.log(state);
    return state;
  }
  public static forBill = (products: []) => {
    const adaptedProducts = products.map((product: Product) => {
      return {
        ...product,
        id: product.id,
        code: product.code,
        amount: product.amount,
        description: product.description,
        price: product.price,
      } as unknown as Product;
    });
    return adaptedProducts;
  };
  public static fromDocumentData(data: DocumentData, dataId: string): Product {
    const product = new Product();
    product.id = dataId;
    data.code ? (product.code = data.code) : (product.code = ""),
      // data.peso || data.details
      //   ? (product.peso = data.peso)
      //   : (product.peso = ""),
      // data.color ? (product.color = data.color) : (product.color = ""),
      // data.medidas ? (product.medidas = data.medidas) : (product.medidas = ""),
      data.suplier
        ? (product.suplier = data.suplier)
        : (product.suplier = new Suplier());
    data.description
      ? (product.description = data.description)
      : (product.description = ""),
      data.category
        ? (product.category = data.category)
        : (product.category = "");
    data.price ? (product.price = data.price) : (product.price = 0),
      data.unit ? (product.unit = data.unit) : (product.unit = "unidades"),
      data.gain ? (product.gain = data.gain) : (product.gain = 0),
      (product.salePrice = data.price + data.price * data.gain * 0.01);
    data.amount ? (product.amount = data.amount) : (product.amount = 0);
    if (data.image.length !== 0) {
      product.image = data.image;
    } else {
      product.image = "";
    }
    product.last_update =
      data.last_update instanceof Timestamp
        ? data.last_update.toDate()
        : new Date();

    // Manejo de creation_date
    product.creation_date =
      data.creation_date instanceof Timestamp
        ? data.creation_date.toDate()
        : new Date();
    return product;
  }
}
