"use client";
import React, { useState } from "react";
import { updateBusinessBalance } from "@/actions/billing";
import { createMovement } from "@/actions/movements";
import { Input } from "./ui/input";
import { Session } from "next-auth";
import { toast } from "react-hot-toast";

interface props {
  session: Session | null;
}
const AddButton = ({ session }: props) => {
  const [openTotalInput, setOpenTotalInput] = useState(false);
  const [totalInput, setTotalInput] = useState<number | "">("");
  const [loading, setLoading] = useState(false);

  return (
    <div className="flex flex-col w-full sm:w-1/3 max-w-[200px] relative">
      <button
        className="w-full py-3 px-4 bg-green-50 hover:bg-green-100 text-green-700 font-semibold rounded-lg shadow-sm border border-green-200 transition-colors focus:outline-none focus:ring-2 focus:ring-green-400"
        onClick={() => setOpenTotalInput(!openTotalInput)}
      >
        Ingreso
      </button>
      
      {openTotalInput && (
        <div className="absolute top-full mt-2 w-full z-10 bg-white p-2 rounded-lg shadow-lg border border-gray-100 dark:border-gray-800 dark:bg-gray-900">
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
                  }
                } catch (err) {
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
