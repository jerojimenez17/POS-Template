import { notFound } from "next/navigation";
import Link from "next/link";
import { getBusinessBySlug } from "@/actions/business";
import { getPublicProductsByBusinessId } from "@/actions/catalog";
import ProductSelector from "@/components/catalog/product-selector";
import { PublicCart } from "@/components/catalog/public-cart";
import { Button } from "@/components/ui/button";
import { Lock, MessageCircle, ArrowLeft } from "lucide-react";

interface Props {
  params: Promise<{ business: string }>;
}

export default async function PublicCatalogPage({ params }: Props) {
  const { business: businessSlug } = await params;

  const business = await getBusinessBySlug(businessSlug);
  if (!business) notFound();

  let products: Awaited<ReturnType<typeof getPublicProductsByBusinessId>> = [];
  let catalogEnabled = true;

  try {
    products = await getPublicProductsByBusinessId(business.id);
  } catch {
    catalogEnabled = false;
  }

  if (!catalogEnabled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-4">
        <div className="flex flex-col items-center text-center max-w-md gap-4">
          <div className="w-14 h-14 rounded-full bg-red-50 dark:bg-red-950/50 flex items-center justify-center">
            <Lock className="h-7 w-7 text-red-400 dark:text-red-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Funcionalidad no disponible
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
              La funcionalidad &quot;Catálogo público&quot; no está incluida en
              tu plan actual.
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Contactanos vía WhatsApp para resolverlo.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full mt-2">
            <Link
              href="/"
              className="flex-1"
            >
              <Button variant="outline" className="w-full rounded-lg flex items-center gap-2 justify-center">
                <ArrowLeft className="h-4 w-4" />
                Volver al inicio
              </Button>
            </Link>
            <a
              href="https://wa.me/5492265418113"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1"
            >
              <Button className="w-full rounded-lg bg-[#25D366] hover:bg-[#128C7E] text-white flex items-center gap-2 justify-center">
                <MessageCircle className="h-4 w-4" />
                Contactar por WhatsApp
              </Button>
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
    <ProductSelector
      variant="public-catalog"
      products={products}
      business={{ name: business.name, logo: business.logo }}
    />
    <PublicCart businessId={business.id} />
    </>
  );
}
