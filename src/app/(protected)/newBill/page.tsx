import BillParametersForm from "@/components/Billing/BillParametersForm";
import ProductsTable from "@/components/Billing/ProductsTable";
import BillProvider from "@/context/BillProvider";
import { auth } from "../../../../auth";

const page = async () => {
  const session = await auth();
  return (
    <BillProvider>
      <div className="flex flex-col overflow-auto">
        <div className="h-fit py-4 md:h-1/4 container my-3 mx-auto w-full shadow rounded-xl">
          <BillParametersForm />
        </div>
        <ProductsTable session={session} />
      </div>
    </BillProvider>
  );
};

export default page;
