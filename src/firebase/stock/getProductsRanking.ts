import { collection, doc, getDoc } from "firebase/firestore";
import { db } from "../config";

export type RankedProduct = {
  id: string;
  code: string;
  nombre: string;
  price: number;
  ventas: number;
};

const getProductsRanking = async (month: string) => {
  const collectionRef = collection(db, `ranking`);
  const querySnapshot = await getDoc(doc(collectionRef, month));

  if (!querySnapshot.exists()) return [];
  const products = querySnapshot.data().productos;
  if (!products || typeof products !== "object") {
    return [];
  }
  const rankedProducts: RankedProduct[] = Object.entries(products).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ([id, product]: [string, any]) => ({
      id,
      code: product.code,
      price: product.price,
      nombre: product.nombre,
      ventas: product.ventas,
    })
  );
  rankedProducts.sort((a, b) => b.ventas - a.ventas);
  return rankedProducts;
};

export default getProductsRanking;
