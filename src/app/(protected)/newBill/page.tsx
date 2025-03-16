import BillParametersForm from "@/components/Billing/BillParametersForm";
import ProductsTable from "@/components/Billing/ProductsTable";
import BillProvider from "@/context/BillProvider";

const page = () => {
  return (
    <BillProvider>
      <div className="flex flex-col overflow-auto">
        <div className="h-fit py-4 md:h-1/4 container my-3 mx-auto w-full shadow rounded-xl">
          <BillParametersForm />
        </div>
        <ProductsTable />
      </div>
    </BillProvider>
  );
};

export default page;
