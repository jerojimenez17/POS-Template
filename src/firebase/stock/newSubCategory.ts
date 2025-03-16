import { db } from "../config";
import { addDoc, collection } from "firebase/firestore";

export const addSubcategory = async (category: string) => {
  try {
    const collectionRef = collection(db, "subcategories");
    await addDoc(collectionRef, { name: category });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (err) {
    return { error: "Error al guardar producto" };
  }
};
