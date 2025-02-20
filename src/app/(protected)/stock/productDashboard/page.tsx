import ProductDashboad from "@/components/stock/product-dashboard";
import { auth } from "../../../../../auth";

const page = async () => {
  const session = await auth();
  return <ProductDashboad session={session} />;
};

export default page;
