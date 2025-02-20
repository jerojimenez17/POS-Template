import { collection, getDocs } from "firebase/firestore";
import { fbDB } from "../config";
import { ClientFirebaseAdapter } from "@/models/ClientFirebaseAdapter";
import Client from "@/models/Client";
import { Suplier } from "@/models/Suplier";
import { SuplierFirebaseAdapter } from "@/models/SuplierFirebaseAdapter";

export const getSuppliers = async (): Promise<Suplier[]> => {
  try {
    const data = await getDocs(collection(fbDB, `supliers`)); // Obtén los documentos
    if (data.docs) {
      return SuplierFirebaseAdapter.fromDocumentDataArray(data.docs); // Adapta y retorna los datos
    }
  } catch (error) {
    console.error("Error fetching suppliers:", error); // Maneja errores
  }
  return []; // Retorna vacío si ocurre un error o no hay datos
};
