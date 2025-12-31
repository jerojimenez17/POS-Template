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
    return state;
  }
  private static toPlainDate(val: any): Date {
    if (!val) return new Date();
    if (val instanceof Date) return val;
    if (typeof val === "object" && "seconds" in val) {
      return new Date(val.seconds * 1000 + (val.nanoseconds || 0) / 1000000);
    }
    if (typeof val === "string" || typeof val === "number") {
      return new Date(val);
    }
    return new Date();
  }

  public static forBill = (products: any[]) => {
    if (!products) return [];
    return products.map((product: any) => {
      // Create a plain object with only the necessary serializable fields
      return {
        id: String(product.id || ""),
        code: String(product.code || ""),
        description: String(product.description || ""),
        brand: String(product.brand || ""),
        subCategory: String(product.subCategory || ""),
        price: Number(product.price || 0),
        salePrice: Number(product.salePrice || 0),
        gain: Number(product.gain || 0),
        client_bonus: Number(product.client_bonus || 0),
        unit: String(product.unit || "unidades"),
        image: String(product.image || ""),
        imageName: String(product.imageName || ""),
        amount: Number(product.amount || 0),
        category: String(product.category || ""),
        last_update: ProductFirebaseAdapter.toPlainDate(product.last_update),
        creation_date: ProductFirebaseAdapter.toPlainDate(product.creation_date),
        // Deep map suplier to ensure it's a plain object
        suplier: product.suplier ? {
          id: String(product.suplier.id || ""),
          name: String(product.suplier.name || ""),
          email: String(product.suplier.email || ""),
          phone: String(product.suplier.phone || ""),
          bonus: Number(product.suplier.bonus || 0),
          creation_date: ProductFirebaseAdapter.toPlainDate(product.suplier.creation_date)
        } : {
          id: "",
          name: "",
          email: "",
          phone: "",
          bonus: 0,
          creation_date: new Date()
        }
      } as Product;
    });
  };
  public static fromDocumentData(data: DocumentData, dataId: string): Product {
    const product = {
      id: dataId,
      code: data.code || "",
      suplier: data.suplier
        ? {
            id: String(data.suplier.id || ""),
            name: String(data.suplier.name || ""),
            email: String(data.suplier.email || ""),
            phone: String(data.suplier.phone || ""),
            bonus: Number(data.suplier.bonus || 0),
            creation_date: ProductFirebaseAdapter.toPlainDate(data.suplier.creation_date)
          }
        : {
            id: "",
            name: "",
            email: "",
            phone: "",
            bonus: 0,
            creation_date: new Date()
          },
      description: data.description || "",
      category: data.category || "",
      price: Number(data.price || 0),
      unit: String(data.unit || "unidades"),
      gain: Number(data.gain || 0),
      salePrice: Number(data.price || 0) + Number(data.price || 0) * Number(data.gain || 0) * 0.01,
      amount: Number(data.amount || 0),
      image: String(data.image || ""),
      last_update: ProductFirebaseAdapter.toPlainDate(data.last_update),
      creation_date: ProductFirebaseAdapter.toPlainDate(data.creation_date),
      brand: String(data.brand || ""),
      subCategory: String(data.subCategory || ""),
      imageName: String(data.imageName || ""),
      client_bonus: Number(data.client_bonus || 0),
    } as Product;
    
    return product;
  }
}
