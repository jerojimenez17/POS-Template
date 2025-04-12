import Product from "@/models/Product";
import { db } from "../config";
import { doc, runTransaction } from "firebase/firestore";
import { ProductFirebaseAdapter } from "@/models/ProductFirebaseAdapter";

export const updateAmount = async (products: Product[]) => {
  products.forEach((product) => {
    runTransaction(db, async (transaction) => {
      const stockRef = doc(db, "stock", product.id);
      const productDoc = await transaction.get(stockRef);
      if (!productDoc.exists()) {
        throw new Error("El producto no existe");
      }
      const adaptedProduct = ProductFirebaseAdapter.fromDocumentData(
        productDoc.data(),
        productDoc.id
      );
      const Editproduct = {
        ...adaptedProduct,
        amount: adaptedProduct.amount - product.amount,
      };
      console.log({
        ...adaptedProduct,
        amount: adaptedProduct.amount - product.amount,
      });
      transaction.update(stockRef, {
        ...Editproduct,
      });
    });
  });
  try {
  } catch {
    return { error: "Error al actualizar producto" };
  }
};
