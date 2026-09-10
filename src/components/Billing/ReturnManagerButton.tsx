"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useCashbox } from "@/context/CashboxContext";
import ReturnManagerModal from "./ReturnManagerModal";

interface Props {
  session: unknown;
}

export default function ReturnManagerButton({ session }: Props) {
  const [open, setOpen] = useState(false);
  const { hasActiveSession, setIsOpeningModalOpen } = useCashbox();

  const handleOpen = useCallback(() => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      toast.error("Sin conexión");
      return;
    }
    if (!hasActiveSession) {
      toast.error("Debe abrir una sesión de caja para realizar devoluciones");
      setIsOpeningModalOpen(true);
      return;
    }
    setOpen(true);
  }, [hasActiveSession, setIsOpeningModalOpen]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "F6") {
        e.preventDefault();
        handleOpen();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleOpen]);

  return (
    <>
      <Button
        variant="outline"
        onClick={handleOpen}
        aria-label="Gestionar devoluciones"
        className="rounded-lg h-10 gap-2"
      >
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        Devoluciones
      </Button>
      <ReturnManagerModal open={open} onOpenChange={setOpen} session={session as never} />
    </>
  );
}
