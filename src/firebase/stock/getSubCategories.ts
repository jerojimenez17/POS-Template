import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../config";

export const getSubcategories = async () => {
  const collectionRef = collection(db, "subcategories");

  onSnapshot(collectionRef, (querySnapshot) => {
    const categories: string[] = [];
    querySnapshot.docs.forEach((snapshot) => {
      categories.push(snapshot.data().name);
      return categories;
    });
  });
};
