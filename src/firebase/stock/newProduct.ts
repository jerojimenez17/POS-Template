import Product from "@/models/Product";
import { db } from "../config";
import { addDoc, collection } from "firebase/firestore";

export const addProduct = async (product: Product) => {
  try {
    const collectionRef = collection(db, "stock");
    const copySupplier = { ...product.suplier };
    await addDoc(collectionRef, { ...product, suplier: copySupplier });
    return { success: "Producto cargado" };
  } catch (err) {
    return { error: err };
  }
};
