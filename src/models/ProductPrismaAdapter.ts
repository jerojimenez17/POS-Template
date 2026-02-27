import { Product as PrismaProduct, Supplier, Brand, Category, Subcategory } from "@prisma/client";
import Product from "./Product";

type PrismaProductWithRelations = PrismaProduct & {
  supplier?: Supplier | null;
  brand?: Brand | null;
  category?: Category | null;
  subCategory?: Subcategory | null;
};

export class ProductPrismaAdapter {
  public static toDomain(prismaProduct: PrismaProductWithRelations): Product {
    const product = new Product();
    
    product.id = prismaProduct.id;
    product.code = prismaProduct.code || "";
    product.description = prismaProduct.description || "";
    product.price = prismaProduct.price;
    product.salePrice = prismaProduct.salePrice;
    product.gain = prismaProduct.gain;
    product.amount = prismaProduct.amount;
    product.unit = prismaProduct.unit || "unidades";
    product.image = prismaProduct.image || "";
    product.imageName = prismaProduct.imageName || "";
    product.client_bonus = prismaProduct.client_bonus;
    product.last_update = prismaProduct.last_update;
    product.creation_date = prismaProduct.creation_date;
    
    // Relations
    product.brand = prismaProduct.brand?.name || "";
    product.category = prismaProduct.category?.name || "";
    product.subCategory = prismaProduct.subCategory?.name || "";
    
    if (prismaProduct.supplier) {
      product.suplier = {
        id: prismaProduct.supplier.id,
        name: prismaProduct.supplier.name,
        email: prismaProduct.supplier.email || "",
        phone: prismaProduct.supplier.phone || "",
        bonus: prismaProduct.supplier.bonus,
        creation_date: prismaProduct.supplier.creation_date,
      };
    }

    return product;
  }
}
