import { db } from "../config";
import { doc, runTransaction } from "firebase/firestore";
import moment from "moment";
import Product from "@/models/Product";

export const updateMonthlyRanking = async (products: Product[]) => {
  const monthId = moment().format("YYYY-MM"); // ej. "2025-06"
  const rankingRef = doc(db, "ranking", monthId);

  try {
    await runTransaction(db, async (transaction) => {
      const rankingDoc = await transaction.get(rankingRef);
      const existingData = rankingDoc.exists()
        ? rankingDoc.data()
        : { productos: {} };

      const updatedProductos = { ...existingData.productos };

      products.forEach((product) => {
        const existingEntry = updatedProductos[product.id];
        const currentSales = existingEntry?.ventas || 0;

        updatedProductos[product.id] = {
          code: product.code,
          nombre: product.description, // o product.nombre si usás español
          ventas: currentSales + product.amount,
          price: product.salePrice,
        };
      });

      transaction.set(
        rankingRef,
        { productos: updatedProductos },
        { merge: true }
      );
    });

    return { success: true };
  } catch (err) {
    console.error("Error al actualizar el ranking:", err);
    return { error: "No se pudo actualizar el ranking" };
  }
};
