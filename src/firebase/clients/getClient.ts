import { collection, getDocs } from "firebase/firestore";
import { fbDB } from "../config";
import { ClientFirebaseAdapter } from "@/models/ClientFirebaseAdapter";
import Client from "@/models/Client";

export const getClients = async (): Promise<Client[]> => {
  try {
    const data = await getDocs(collection(fbDB, `clients`)); // Obtén los documentos
    if (data.docs) {
      return ClientFirebaseAdapter.fromDocumentDataArray(data.docs); // Adapta y retorna los datos
    }
  } catch (error) {
    console.error("Error fetching clients:", error); // Maneja errores
  }
  return []; // Retorna vacío si ocurre un error o no hay datos
};
