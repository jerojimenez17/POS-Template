import { db } from "@/firebase/config";
import BillState from "@/models/BillState";
import { FirebaseAdapter } from "@/models/FirebaseAdapter";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  where,
} from "firebase/firestore";
import { cache } from "react";
export const revalidate = 0;
export const fetchSales = cache(async () => {
  const collectionRef = collection(db, "sales");
  try {
    const docSnap = await getDocs(collectionRef);

    const adapterDocs: BillState[] = FirebaseAdapter.fromDocumentDataArray(
      docSnap.docs
    );
    if (adapterDocs && adapterDocs.length > 0) {
      return adapterDocs;
    } else {
      return [];
    }
  } catch (err) {
    console.error(err);
    return [];
  }
});

export const fetchSalesOnce = async () => {
  try {
    const PAGE_SIZE = 1100;
    const q = query(
      collection(db, "sales"),
      orderBy("date", "desc"),
      limit(PAGE_SIZE)
    );
    const querySnapshot = await getDocs(q);
    return FirebaseAdapter.fromDocumentDataArray(querySnapshot.docs);
  } catch (err) {
    console.error("Error fetching sales:", err);
    return [];
  }
};
export const fetchSalesByDate = async (startDate: Date, endDate: Date) => {
  try {
    const PAGE_SIZE = 1100;
    const q = query(
      collection(db, "sales"),
      where("date", "<", endDate),
      where("date", ">", startDate),
      orderBy("date", "desc"),
      limit(PAGE_SIZE)
    );
    const querySnapshot = await getDocs(q);
    return FirebaseAdapter.fromDocumentDataArray(querySnapshot.docs);
  } catch (err) {
    console.error("Error fetching sales:", err);
    return [];
  }
};

export const fetchTotalRegiter = async () => {
  try {
    const documentData = await getDoc(
      doc(db, "cashRegister", "DjnQREkrJnRkXiY4p3a5")
    );
    console.log(documentData.data()?.Total);
    return documentData.data()?.Total;
  } catch (err) {
    console.error(err);
    return 0;
  }
};
export const updateTotal = async (saleTotal: number) => {
  try {
    await runTransaction(db, async (transaction) => {
      const docRef = doc(db, "cashRegister", "DjnQREkrJnRkXiY4p3a5");
      const sfDoc = await transaction.get(docRef);
      if (!sfDoc.exists()) {
        throw "Document dosen't exists";
      }
      const newTotal = Number(sfDoc.data().Total) + saleTotal;
      transaction.update(docRef, { Total: newTotal });
    });
  } catch (err) {
    console.error(err);
  }
};
export const changeTotal = async (total: number) => {
  try {
    await runTransaction(db, async (transaction) => {
      const docRef = doc(db, "cashRegister", "DjnQREkrJnRkXiY4p3a5");
      const sfDoc = await transaction.get(docRef);
      if (!sfDoc.exists()) {
        throw "Document doesn't exists";
      }
      transaction.update(docRef, { Total: total });
    });
  } catch {}
};

export const addToTotal = async (amount: number) => {
  try {
    await runTransaction(db, async (transaction) => {
      const docRef = doc(db, "cashRegister", "DjnQREkrJnRkXiY4p3a5");
      const sfDoc = await transaction.get(docRef);

      if (!sfDoc.exists()) {
        throw new Error("Document doesn't exist");
      }

      // Obtén el total actual del documento
      const currentTotal = sfDoc.data().Total;

      // Suma el valor pasado por parámetro al total actual
      const newTotal = currentTotal + amount;

      // Actualiza el documento con el nuevo total
      transaction.update(docRef, { Total: newTotal });
    });
  } catch (err) {
    console.error("Transaction failed: ", err);
  }
};

export const writeMovement = async () => {
  try {
    const documentData = await addDoc(collection(db, "cashMovements"), {});
  } catch (err) {
    console.error(err);
  }
};

export const getVoucher = async () => {};

export const updateSale = async (saleId: string, data: Partial<BillState>) => {
  try {
    const saleRef = doc(db, "sales", saleId);
    await runTransaction(db, async (transaction) => {
      const sfDoc = await transaction.get(saleRef);
      if (!sfDoc.exists()) {
        throw "Document doesn't exist";
      }
      transaction.update(saleRef, data);
    });
  } catch (err) {
    console.error("Error updating sale:", err);
    throw err;
  }
};
