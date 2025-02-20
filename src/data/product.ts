import { db } from "@/lib/db";

export const getProductByDescription = async (description: string) => {
  try {
    const product = await db.product.findFirst({ where: { description } });
    return product;
  } catch {
    return null;
  }
};
export const getProductById = async (id: string) => {
  try {
    const product = await db.product.findUnique({ where: { id } });
    return product;
  } catch {
    return null;
  }
};
export const getProducts = async () => {
  try {
    const products = await db.product.findMany();
    return products;
  } catch (err) {
    return null;
  }
};
