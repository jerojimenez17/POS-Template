import BillParametersForm from "@/components/Billing/BillParametersForm";
import ProductsTable from "@/components/Billing/ProductsTable";
import BillProvider from "@/context/BillProvider";
import { auth } from "../../../../auth";

const page = async () => {
  const session = await auth();
  return (
    <BillProvider>
      <div className="flex flex-col max-h-full mb-5 pb-16 overflow-auto">
        <div className="h-fit py-4 md:h-1/4 container my-3 mx-auto w-full shadow rounded-xl">
          <BillParametersForm />
        </div>
        <ProductsTable session={session} />
      </div>
    </BillProvider>
  );
};

export default page;
