import Client from "@/models/Client";
import { db } from "../config";
import { addDoc, collection } from "firebase/firestore";

export const addClient = async (client: Client) => {
  try {
    console.log("adding client");
    const collectionRef = collection(db, "clients");
    await addDoc(collectionRef, client);
    return { success: "Cliente agregado" };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (err) {
    return { error: "Error al guardar cliente" };
  }
};
