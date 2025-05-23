import Order from "@/models/Order";
import { deleteDoc, doc } from "firebase/firestore";
import { db } from "../config";

export const deleteOrderDoc = async (order: Order) => {
  try {
    const orderRef = doc(db, "orders", order.id);
    await deleteDoc(orderRef);
  } catch (error) {
    console.error(error);
  }
};
