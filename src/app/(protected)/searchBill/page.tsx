import FilterBillPanel from "@/components/Billing/FilterBillPanel";
import SalesTable from "@/components/Billing/SalesTable";
import { auth } from "../../../../auth";
import { Suspense } from "react";
import Spinner from "@/components/ui/Spinner";
import { fetchSalesOnce } from "@/services/firebaseService";

const page = async () => {
  const session = await auth();
  const sales = await fetchSalesOnce();
  
  return (
     <Suspense fallback={<Spinner/>}>

    <div className="h-full">
      {" "}
      <div className=" text-center align-middle justify-center sm:w-screen-sm mb-10 overflow-auto">
        <FilterBillPanel
          session={session}
        />
        <SalesTable sales={sales} session={session} />
      </div>
    </div>
          </Suspense>
  );
};

export default page;
