"use client";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { useRouter, useSearchParams } from "next/navigation";
import DatePicker from "react-datetime";
import "react-datetime/css/react-datetime.css";

const PickDateStockRanking = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const handleChange = (e: unknown) => {
    const date = new Date(String(e));
    const year = date.getFullYear();
    const month = format(date, "MM");
    const params = new URLSearchParams(searchParams);
    params.set("month", `${year}-${month}`);
    router.push(`?${params.toString()}`);
  };

  return (
    <div className="h-1/4 w-full  flex">
      <div className="flex-1 flex shadow-lg gap-2 w-1/3 flex-col items-center justify-center">
        <label
          htmlFor="datepicker"
          className="text-center font-semibold w-1/3 text-lg flex mx-auto items-center justify-center"
        >
          <span className="text-gray-darker">
            Seleccione un mes para ver el ranking de stocks
          </span>
        </label>
        <div
          id="datepicker"
          className=" bg-transparent mx-auto  flex gap-2 items-center rounded relative text-black"
        >
          <DatePicker
            dateFormat="MM/YYYY" // muestra solo mes/año
            locale="es"
            onChange={handleChange}
            input={true}
            className="appearance-none shadow-lg bg-slate-200/70 shadow-gray-300 border rounded py-2 px-3 text-gray-darker "
          ></DatePicker>
          <CalendarIcon />
        </div>
      </div>
    </div>
  );
};

export default PickDateStockRanking;
