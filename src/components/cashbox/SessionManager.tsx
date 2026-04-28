"use client";

import { useState, useEffect } from "react";
import { CloseSessionButton } from "./CloseSessionButton";
import { OpenSessionModal } from "./OpenSessionModal";
import { Button } from "@/components/ui/button";
import { Key } from "lucide-react";
import { useCashbox } from "@/context/CashboxContext";

interface SessionManagerProps {
  hasActiveSession: boolean;
}

export const SessionManager = ({ hasActiveSession: hasActiveSessionProp }: SessionManagerProps) => {
  const { 
    hasActiveSession, 
    setHasActiveSession, 
    isClosing, 
    setIsClosing,
    isOpeningModalOpen,
    setIsOpeningModalOpen
  } = useCashbox();

  // Sync prop with context
  useEffect(() => {
    setHasActiveSession(hasActiveSessionProp);
  }, [hasActiveSessionProp, setHasActiveSession]);

  // Handle default visibility logic
  useEffect(() => {
    // If no session and not in closing process, open the modal by default
    if (!hasActiveSession && !isClosing) {
      setIsOpeningModalOpen(true);
    }
  }, [hasActiveSession, isClosing, setIsOpeningModalOpen]);

  return (
    <>
      <div className="flex items-center gap-3">
        <CloseSessionButton 
          hasActiveSession={hasActiveSession} 
          onClosingChange={setIsClosing} 
        />
        {!hasActiveSession && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsOpeningModalOpen(true)}
            className="text-green-600 border-green-200 hover:bg-green-50 hover:text-green-700 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-900/20"
          >
            <Key className="h-4 w-4 mr-2" />
            Abrir Caja
          </Button>
        )}
      </div>
      <OpenSessionModal 
        isOpen={isOpeningModalOpen} 
        onClose={() => setIsOpeningModalOpen(false)}
      />
    </>
  );
};
