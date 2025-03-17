import { db } from "../config";
import { collection, onSnapshot } from "firebase/firestore";

export const getCategories = async () => {
  const collectionRef = collection(db, "categories");

  onSnapshot(collectionRef, (querySnapshot) => {
    const categories: string[] = [];
    querySnapshot.docs.forEach((snapshot) => {
      categories.push(snapshot.data().name);
      return categories;
    });
  });
};
