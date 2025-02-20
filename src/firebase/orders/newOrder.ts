import { fbDB } from "../config";
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  DocumentReference,
  runTransaction,
} from "firebase/firestore";
import Order, { PaidStatus, Status } from "@/models/Order";
import { OrderFirebaseAdapter } from "@/models/OrderFirebaseAdapter";

export const addOrder = async (order: Order) => {
  try {
    console.log(order);
    for (let i = 0; i < order.products.length; i++) {
      await discountStock(order.products[i].id, order.products[i].amount);
    }
    const collectionOrderRef = collection(fbDB, "orders");
    // Serialización de productos
    const serializedProducts = order.products.map((product) => ({
      id: product.id,
      cod: product.cod,
      description: product.description,
      brand: product.brand,
      subCategory: product.subCategory,
      price: product.price,
      salePrice: product.salePrice,
      gain: product.gain,
      client_bonus: product.client_bonus,
      unit: product.unit,
      image: product.image,
      imageName: product.imageName,
      amount: product.amount,
      last_update: product.last_update, // Convertir fecha a string
      category: product.category,
      suplier: product.suplier ? { ...product.suplier } : null, // Manejar si no hay suplier
    }));

    // Guardar la orden en Firestore
    const orderRef = await addDoc(collectionOrderRef, {
      id: order.id ? order.id : "",
      products: serializedProducts,
      client: order.client ? order.client.id : null,
      date: order.date ? order.date.toISOString() : null, // Convertir fecha a string
      status: order.status ? order.status : null,
      total: order.total ? order.total : 0,
      seller: order.seller,
      paidStatus: order.paidStatus ? order.paidStatus : null,
    });
    await updateBalance(order.client.id, -1 * order.total);
    await addOrderToClient(order.client.id, orderRef);
  } catch (err) {
    console.log(err);
    return { error: "Error al guardar Orden" };
  }
};
// export const confirmOrder = async (orderID: string) => {
//   const orderRef = doc(fbDB, "orders", orderID);
//   try {
//     await runTransaction(fbDB, async (transaction) => {
//       const orderDoc = await transaction.get(orderRef);
//       if (!orderDoc.exists()) {
//         throw new Error(`Order dosen't exists`);
//       }
//       const formatedOrder = OrderFirebaseAdapter.fromDocumentData(
//         orderDoc.data(),
//         orderDoc.id
//       );
//       updateBalance(formatedOrder.client.id, formatedOrder.total);
//       transaction.update(orderRef, { status: Status.confirmado });
//     });
//   } catch (err) {
//     throw new Error(`Error${err}`);
//   }
// };
export const paidOrder = async (orderID: string) => {
  const orderRef = doc(fbDB, "orders", orderID);
  try {
    await runTransaction(fbDB, async (transaction) => {
      const orderDoc = await transaction.get(orderRef);
      if (!orderDoc.exists()) {
        throw new Error(`Order dosen't exists`);
      }
      const formatedOrder = OrderFirebaseAdapter.fromDocumentData(
        orderDoc.data(),
        orderDoc.id
      );
      updateBalance(formatedOrder.client.id, formatedOrder.total);
      transaction.update(orderRef, { status: Status.confirmado });
    });
  } catch (err) {
    throw new Error(`Error${err}`);
  }
};
async function addOrderToClient(
  clientId: string,
  orderRef: DocumentReference
): Promise<void> {
  const clientRef = doc(fbDB, "clients", clientId);

  try {
    await runTransaction(fbDB, async (transaction) => {
      const clientDoc = await transaction.get(clientRef);

      if (!clientDoc.exists()) {
        throw new Error("Client does not exist!");
      }

      transaction.update(clientRef, {
        orders: arrayUnion(orderRef),
      });
    });

    console.log("Order successfully added to client!" + orderRef);
  } catch (error) {
    console.error("Transaction failed: ", error);
  }
}

async function updateBalance(clientID: string, total: number) {
  const clientDocID: string = clientID;
  console.log(clientDocID);
  const clientRef = doc(fbDB, "clients", clientDocID);
  try {
    await runTransaction(fbDB, async (transaction) => {
      const clientDoc = await transaction.get(clientRef);
      if (!clientDoc.exists()) {
        throw new Error("Error: Cliente " + clientID + " no existe");
      }
      const clientData = clientDoc.data();
      const currentBalance = clientData.balance;
      const newBalance = currentBalance + total;
      transaction.update(clientRef, { balance: newBalance });
    });
  } catch (err) {
    console.error("Update failed", err);
  }
}
export async function discountStock(
  productId: string,
  discountValue: number
): Promise<void> {
  const productRef = doc(fbDB, "stock", productId.split("id")[1]);

  try {
    await runTransaction(fbDB, async (transaction) => {
      const productDoc = await transaction.get(productRef);

      if (!productDoc.exists()) {
        throw new Error("El producto no existe!");
      }

      const productData = productDoc.data();
      const currentAmount = productData?.amount ?? 0;

      const newAmount = currentAmount - discountValue;

      if (newAmount < 0) {
        throw new Error("No hay suficiente stock");
      }

      transaction.update(productRef, { amount: newAmount });
    });

    console.log("Transaction successfully committed!");
  } catch (error) {
    console.error("Transaction failed: ", error);
  }
}

export async function changeStatus(
  orderId: string,
  newStatus: Status
): Promise<void> {
  const orderRef = doc(fbDB, "orders", orderId);
  if (newStatus === Status.confirmado) {
    // confirmOrder(orderId);
  } else {
    try {
      await runTransaction(fbDB, async (transaction) => {
        const orderDoc = await transaction.get(orderRef);

        if (!orderDoc.exists()) {
          throw new Error("Order does not exist!");
        }

        const orderData = orderDoc.data();
        const currentStatus = orderData?.status;

        if (currentStatus === newStatus) {
          throw new Error("Order has the same status");
        }

        transaction.update(orderRef, { status: newStatus });
      });

      console.log("Transaction successfully committed!");
    } catch (error) {
      console.error("Transaction failed: ", error);
    }
  }
}
export async function changePaidStatus(
  orderId: string,
  newStatus: PaidStatus
): Promise<void> {
  const orderRef = doc(fbDB, "orders", orderId);
  if (newStatus === PaidStatus.pago) {
    paidOrder(orderId);
  }
  try {
    await runTransaction(fbDB, async (transaction) => {
      const orderDoc = await transaction.get(orderRef);

      if (!orderDoc.exists()) {
        throw new Error("Order does not exist!");
      }

      const orderData = orderDoc.data();
      const currentStatus = orderData?.paidStatus;

      if (currentStatus === newStatus) {
        throw new Error("Order has the same status");
      }

      transaction.update(orderRef, { paidStatus: newStatus });
    });

    console.log("Transaction successfully committed!");
  } catch (error) {
    console.error("Transaction failed: ", error);
  }
}
