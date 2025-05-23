import FilterBillPanel from "@/components/Billing/FilterBillPanel";
import SalesTable from "@/components/Billing/SalesTable";
import { auth } from "../../../../auth";

const page = async () => {
  const session = await auth();
  return (
    <div className="h-full">
      {" "}
      <div className="h-screen text-center align-middle justify-center sm:w-screen-sm mb-10 overflow-auto">
        <FilterBillPanel
          session={session}
          // sellers={Array.from(new Set(sales.map((sale) => sale.seller)))}
        />
        <SalesTable session={session} />
      </div>
    </div>
  );
};

export default page;
