import { Suspense } from "react";
import Spinner from "@/components/ui/Spinner";
import SearchBillClient from "./SearchBillClient";

export const dynamic = 'force-dynamic';

export default function SearchBillPage() {
  return (
    <div className="flex flex-col items-center w-full max-w-7xl mx-auto px-4 py-8 space-y-6 overflow-auto mb-10">
      <Suspense fallback={
        <div className="flex justify-center items-center h-[50vh]">
          <Spinner />
        </div>
      }>
        <SearchBillClient />
      </Suspense>
    </div>
  );
}