import { notFound } from "next/navigation";
import { getBusinessBySlug } from "@/actions/business";
import { getPublicProductById } from "@/actions/catalog";
import { ProductDetail } from "@/components/catalog/ProductDetail";
import { PublicCart } from "@/components/catalog/public-cart";

interface Props {
  params: Promise<{ business: string; productId: string }>;
}

export default async function ProductDetailPage({ params }: Props) {
  const { business: businessSlug, productId } = await params;

  const business = await getBusinessBySlug(businessSlug);
  if (!business) notFound();

  const product = await getPublicProductById(business.id, productId);
  if (!product) notFound();

  return (
    <>
      <ProductDetail
        product={product}
        businessSlug={businessSlug}
        businessName={business.name}
      />
      <PublicCart businessId={business.id} />
    </>
  );
}
