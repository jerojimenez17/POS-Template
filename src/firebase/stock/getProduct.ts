import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../config";
import { ProductFirebaseAdapter } from "@/models/ProductFirebaseAdapter";

export default async function getProductByCode(code: string) {
  try {
    const stockRef = collection(db, "stock");
    const q = query(stockRef, where("code", "==", code));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      querySnapshot.forEach((doc) => {
        console.log("Document data:", doc.data());
      });
      const prod = ProductFirebaseAdapter.fromDocumentDataArray(
        querySnapshot.docs
      );
      if (prod[0].amount > 0) {
        return prod;
      }
      return prod;
    } else {
      console.log("No such document with the specified code!");
      return null;
    }
  } catch (error) {
    console.error("Error getting documents:", error);
    throw error;
  }
}
//
