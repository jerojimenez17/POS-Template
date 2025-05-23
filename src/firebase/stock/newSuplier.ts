import { Suplier } from "@/models/Suplier";
import { db } from "../config";
import { addDoc, collection } from "firebase/firestore";

export const addSuplier = async (suplier: Suplier) => {
  try {
    const collectionRef = collection(db, "supliers");
    await addDoc(collectionRef, { ...suplier });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (err) {
    return { error: "Error al guardar Proveedor" };
  }
};
