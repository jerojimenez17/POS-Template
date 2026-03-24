import { notFound } from "next/navigation";
import { getBusinessBySlug } from "@/actions/business";
import { getPublicProductsByBusinessId } from "@/actions/catalog";
import CartProvider from "@/components/catalog/context/CartProvider";
import ProductSelector from "@/components/catalog/product-selector";

interface Props {
  params: Promise<{ business: string }>;
}

export default async function PublicCatalogPage({ params }: Props) {
  const { business: businessSlug } = await params;
  
  const business = await getBusinessBySlug(businessSlug);
  if (!business) notFound();

  const products = await getPublicProductsByBusinessId(business.id);

  return (
    <CartProvider>
      <ProductSelector
        variant="public-catalog"
        products={products}
        business={{ name: business.name, logo: business.logo }}
      />
    </CartProvider>
  );
}
