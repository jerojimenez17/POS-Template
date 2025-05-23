import { collection, getDocs } from "firebase/firestore";
import { db } from "../config";
import { Suplier } from "@/models/Suplier";
import { SuplierFirebaseAdapter } from "@/models/SuplierFirebaseAdapter";

export const getSuppliers = async (): Promise<Suplier[]> => {
  try {
    const data = await getDocs(collection(db, `supliers`)); // Obtén los documentos
    if (data.docs) {
      return SuplierFirebaseAdapter.fromDocumentDataArray(data.docs); // Adapta y retorna los datos
    }
  } catch (error) {
    console.error("Error fetching suppliers:", error); // Maneja errores
  }
  return []; // Retorna vacío si ocurre un error o no hay datos
};
