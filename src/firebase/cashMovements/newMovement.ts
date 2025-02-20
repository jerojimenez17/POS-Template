import Movement from "@/models/Movement";
import { addDoc, collection } from "firebase/firestore";
import { db } from "../config";

export default async function newMovement(movement: Movement) {
  try {
    console.log(movement);
    const collectionRef = collection(db, "movements");
    const res = await addDoc(collectionRef, { ...movement });
    console.log(res);
  } catch (err) {
    return { error: "Error al guardar producto" };
  }
}
