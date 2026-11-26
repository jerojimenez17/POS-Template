"use client";
import React, { useEffect, useRef, useState } from "react";
import { updateBusinessBalance } from "@/actions/billing";
import { createMovement } from "@/actions/movements";
import { Input } from "./ui/input";
import { Session } from "next-auth";
import { toast } from "sonner";

interface props {
  session: Session | null;
  onSuccess?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}
const AddButton = ({ session, onSuccess, open, onOpenChange }: props) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = open !== undefined;
  const openTotalInput = isControlled ? open : internalOpen;
  const setOpenTotalInput = (next: boolean) => {
    if (isControlled) onOpenChange?.(next);
    else setInternalOpen(next);
  };
  const containerRef = useRef<HTMLDivElement>(null);
  const setOpenTotalInputRef = useRef(setOpenTotalInput);
  const [totalInput, setTotalInput] = useState<number | "">("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setOpenTotalInputRef.current = setOpenTotalInput;
  });

  useEffect(() => {
    if (!openTotalInput) return;
    const handleOutside = (event: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpenTotalInputRef.current(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [openTotalInput]);

  return (
    <div ref={containerRef} className="flex flex-col relative">
      <button
        className="w-auto sm:min-w-[130px] py-2 px-3 sm:py-3 sm:px-4 bg-green-50 hover:bg-green-100 text-green-700 font-semibold rounded-lg shadow-sm border border-green-200 transition-colors focus:outline-none focus:ring-2 focus:ring-green-400 text-sm sm:text-base whitespace-nowrap"
        onClick={() => setOpenTotalInput(!openTotalInput)}
      >
        Ingreso
      </button>
      
      {openTotalInput && (
        <div className="absolute right-0 top-full mt-2 w-[220px] sm:w-[260px] z-10 bg-white p-3 rounded-xl shadow-lg border border-gray-100 dark:border-gray-800 dark:bg-gray-900">
          <Input
            disabled={loading}
            type="number"
            className="text-gray-900 dark:text-gray-100 focus-visible:ring-green-500"
            value={totalInput}
            placeholder="Monto ($)"
            autoFocus
            onChange={(e) => {
              setTotalInput(e.target.value === "" ? "" : Number(e.target.value));
            }}
            onKeyDown={async (e) => {
              if (e.key === "Enter" && typeof totalInput === "number" && totalInput > 0) {
                setLoading(true);
                try {
                  const moveRes = await createMovement({
                    total: totalInput,
                    seller: session?.user?.email || "",
                    paidMethod: "Deposito",
                  });

                  if (moveRes.error) {
                    toast.error(moveRes.error);
                  } else {
                    await updateBusinessBalance(totalInput);
                    toast.success("Ingreso registrado");
                    setTotalInput("");
                    setOpenTotalInput(false);
                    onSuccess?.(); // Trigger parent refresh
                  }
                } catch {
                  toast.error("Ocurrió un error inesperado");
                } finally {
                  setLoading(false);
                }
              }
            }}
          />
          <p className="text-[10px] text-gray-400 mt-1 text-center">Presiona Enter para confirmar</p>
        </div>
      )}
    </div>
  );
};

export default AddButton;
