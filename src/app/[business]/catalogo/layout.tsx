import { notFound } from "next/navigation";
import { getBusinessBySlug } from "@/actions/business";
import CartProvider from "@/components/catalog/context/CartProvider";
import { PublicCart } from "@/components/catalog/public-cart";

interface Props {
  children: React.ReactNode;
  params: Promise<{ business: string }>;
}

export default async function CatalogoLayout({ children, params }: Props) {
  const { business: businessSlug } = await params;
  const business = await getBusinessBySlug(businessSlug);
  if (!business) notFound();

  return (
    <CartProvider>
      {children}
      <PublicCart businessId={business.id} />
    </CartProvider>
  );
}
