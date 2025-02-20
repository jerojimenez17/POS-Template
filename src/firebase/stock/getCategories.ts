import Product from "@/models/Product";
import { fbDB } from "../config";
import { addDoc, collection, getDoc, onSnapshot } from "firebase/firestore";

export const getCategories = async () => {
  const collectionRef = collection(fbDB, "categories");

  onSnapshot(collectionRef, (querySnapshot) => {
    let categories: string[] = [];
    querySnapshot.docs.forEach((snapshot) => {
      categories.push(snapshot.data().name);
      return categories;
    });
  });
};
