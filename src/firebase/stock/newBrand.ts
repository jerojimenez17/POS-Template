import { db } from "../config";
import { addDoc, collection } from "firebase/firestore";

export const addBrand = async (brand: string) => {
  try {
    const collectionRef = collection(db, "brands");
    await addDoc(collectionRef, { name: brand });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (err) {
    return { error: "Error al guardar Marca" };
  }
};
