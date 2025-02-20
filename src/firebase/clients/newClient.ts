import Client from "@/models/Client";
import { fbDB } from "../config";
import { addDoc, collection } from "firebase/firestore";

export const addClient = async (client: Client) => {
  try {
    console.log("adding client");
    const collectionRef = collection(fbDB, "clients");
    await addDoc(collectionRef, client);
    return { success: "Cliente agregado" };
  } catch (err) {
    return { error: "Error al guardar cliente" };
  }
};
