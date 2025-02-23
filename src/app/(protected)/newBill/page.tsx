import BillParametersForm from "@/components/Billing/BillParametersForm";

const page = () => {
  return (
    <div className="h-full flex flex-col">
      <div className="bg-slate-300 h-40 w-full">
        <BillParametersForm />
      </div>
      <div className="h-full w-full bg-slate-600"></div>
    </div>
  );
};

export default page;
