"use client";

import { useState } from "react";
import { CloseSessionModal } from "@/components/cashbox/CloseSessionModal";
import { Button } from "@/components/ui/button";
import { LockKeyhole } from "lucide-react";

export const CloseSessionButton = ({ 
  hasActiveSession,
  onClosingChange
}: { 
  hasActiveSession: boolean;
  onClosingChange?: (closing: boolean) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {hasActiveSession && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsOpen(true)}
          className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20"
        >
          <LockKeyhole className="h-4 w-4 mr-2" />
          Cerrar Caja
        </Button>
      )}
      <CloseSessionModal 
        isOpen={isOpen} 
        onClose={() => setIsOpen(false)} 
        onClosingChange={onClosingChange}
      />
    </>
  );
};
