import Order from "@/models/Order";
import { deleteDoc, doc } from "firebase/firestore";
import { fbDB } from "../config";

export const deleteOrderDoc = async (order: Order) => {
  try {
    const orderRef = doc(fbDB, "orders", order.id);
    await deleteDoc(orderRef);
  } catch (error) {
    console.error(error);
  }
};
