import CartProvider from "@/components/catalog/context/CartProvider";

interface Props {
  children: React.ReactNode;
  params: Promise<{ business: string }>;
}

export default async function CatalogoLayout({ children }: Props) {
  return (
    <CartProvider>
      {children}
    </CartProvider>
  );
}
