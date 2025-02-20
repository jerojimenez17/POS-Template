import Product from "@/models/Product";
import { fbDB } from "../config";
import { addDoc, collection, getDoc, onSnapshot } from "firebase/firestore";

export const getSubcategories = async () => {
  const collectionRef = collection(fbDB, "subcategories");

  onSnapshot(collectionRef, (querySnapshot) => {
    let categories: string[] = [];
    querySnapshot.docs.forEach((snapshot) => {
      categories.push(snapshot.data().name);
      return categories;
    });
  });
};
