import { doc, runTransaction } from "firebase/firestore";
import { db } from "../config";
import Product from "@/models/Product";

// import { ProductFirebaseAdapter } from "@/models/ProductFirebaseAdapter";

export const editProduct = async (productId: string, productData: Product) => {
  const stockRef = doc(db, "stock", productId);
  try {
    await runTransaction(db, async (transaction) => {
      const productDoc = await transaction.get(stockRef);
      if (!productDoc.exists()) {
        throw new Error(
          `El producto con ID ${productId} no existe en el stock.`
        );
      }

      transaction.update(stockRef, {
        ...productDoc.data(), // Mantenemos los datos existentes
        ...productData, // Sobrescribimos con los nuevos datos
        last_update: new Date(),
        suplier: { ...productData.suplier }, // Actualizamos la fecha de la última modificación
      });
    });
  } catch (err) {
    throw new Error(
      `Error al editar el producto: ${
        err instanceof Error ? err.message : "error desconocido"
      }`
    );
  }
};
