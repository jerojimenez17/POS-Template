"use client";

import PrintModeSelector from "@/components/Billing/PrintModeSelector";
import { SessionManager } from "@/components/cashbox/SessionManager";

interface NewBillHeaderActionsProps {
  hasActiveSession: boolean;
  session: unknown;
}

const NewBillHeaderActions = ({ hasActiveSession }: NewBillHeaderActionsProps) => {
  return (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div className="max-w-7xl mx-auto px-4 md:px-6 flex items-center justify-end gap-2 h-11">
        <PrintModeSelector />
        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700" />
        <SessionManager hasActiveSession={hasActiveSession} />
      </div>
    </div>
  );
};

export default NewBillHeaderActions;
