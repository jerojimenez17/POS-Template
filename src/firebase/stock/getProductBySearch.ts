import { collection, getDocs } from "firebase/firestore";
import { db } from "../config";
import { ProductFirebaseAdapter } from "@/models/ProductFirebaseAdapter";
import Product from "@/models/Product"; // si tu adapter retorna objetos tipo Product

const getProductBySearch = async (query: string): Promise<Product[]> => {
  const allDocs = await getDocs(collection(db, "stock"));

  const normalizedQuery = query.toLowerCase();

  const matchingProducts: Product[] = [];

  allDocs.forEach((doc) => {
    const data = doc.data();
    const code = data.code?.toString().toLowerCase() || "";
    const description = data.description?.toLowerCase() || "";

    const matches =
      code.includes(normalizedQuery) || description.includes(normalizedQuery);

    if (matches) {
      const adapted = ProductFirebaseAdapter.fromDocumentData(data, doc.id);
      matchingProducts.push(adapted);
    }
  });

  return matchingProducts;
};

export default getProductBySearch;
