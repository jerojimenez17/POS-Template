import { fbDB } from "../config";
import { addDoc, collection, getDoc, onSnapshot } from "firebase/firestore";

export const getBrands = async () => {
  const collectionRef = collection(fbDB, "brands");

  onSnapshot(collectionRef, (querySnapshot) => {
    let brands: string[] = [];
    querySnapshot.docs.forEach((snapshot) => {
      brands.push(snapshot.data().name);
      return brands;
    });
  });
};
