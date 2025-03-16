"use server";

import { db } from "@/firebase/config";
import { addProduct } from "@/firebase/stock/newProduct";
import Product from "@/models/Product";
import { Suplier } from "@/models/Suplier";
import { SuplierFirebaseAdapter } from "@/models/SuplierFirebaseAdapter";
import { ProductSchema } from "@/schemas";
import { doc, getDoc } from "firebase/firestore";
import { z } from "zod";

export const newProduct = async (values: z.infer<typeof ProductSchema>) => {
  values.price = Number(values.price);
  let adaptedSuplier: Suplier = new Suplier();
  if (values.suplier) {
    const suplier = await getDoc(doc(db, "supliers/" + values.suplier));
    if (suplier.exists()) {
      adaptedSuplier = SuplierFirebaseAdapter.fromDocumentData(
        suplier.data(),
        suplier.id
      );
    }
  }
  console.log(values.price + values.price * (1.0 + Number(values.gain) * 0.01));
  const product: Product = {
    suplier: adaptedSuplier ? { ...adaptedSuplier } : { ...new Suplier() },
    client_bonus: 0,
    id: "",
    code: values.code,
    price: values.price,
    creation_date: values.creation_date || new Date(),
    amount: values.amount,
    image: values.image,
    imageName: values.imageName,
    brand: values.brand,
    gain: values.gain,
    salePrice: values.price * (1 + Number(values.gain) * 0.01),
    category: values.category,
    description: values.description,
    unit: values.unit,
    last_update: new Date(Date.now()),
    subCategory: values.subCategory,
  };
  console.log(product);
  const parseProduct = { ...product, suplier: adaptedSuplier.id };
  const validateFields = ProductSchema.safeParse(parseProduct);
  if (!validateFields.success) {
    return { error: "Campos Invalidos" };
  }
  const response = await addProduct(product);
  console.log(response);

  const { success, error } = response || {};
  if (error) {
    return { error: error };
  }
  return { succcess: success };
};
