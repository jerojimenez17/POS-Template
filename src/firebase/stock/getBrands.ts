import { db } from "../config";
import { collection, onSnapshot } from "firebase/firestore";

export const getBrands = async () => {
  const collectionRef = collection(db, "brands");

  onSnapshot(collectionRef, (querySnapshot) => {
    const brands: string[] = [];
    querySnapshot.docs.forEach((snapshot) => {
      brands.push(snapshot.data().name);
      return brands;
    });
  });
};
