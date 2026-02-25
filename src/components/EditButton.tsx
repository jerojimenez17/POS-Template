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
const EditButton = ({ session }: props) => {
  const [openTotalInput, setOpenTotalInput] = useState(false);
  const [totalInput, setTotalInput] = useState<number | "">("");
  const [loading, setLoading] = useState(false);

  return (
    <div className="flex flex-col w-full sm:w-1/3 max-w-[200px] relative">
      <button
        className="w-full py-3 px-4 bg-red-50 hover:bg-red-100 text-red-700 font-semibold rounded-lg shadow-sm border border-red-200 transition-colors focus:outline-none focus:ring-2 focus:ring-red-400"
        onClick={() => setOpenTotalInput(!openTotalInput)}
      >
        Retiro
      </button>
      
      {openTotalInput && (
        <div className="absolute top-full mt-2 w-full z-10 bg-white p-2 rounded-lg shadow-lg border border-gray-100 dark:border-gray-800 dark:bg-gray-900">
          <Input
            disabled={loading}
            type="number"
            className="text-gray-900 dark:text-gray-100 focus-visible:ring-red-500"
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
                    total: -1 * totalInput,
                    seller: session?.user?.email || "",
                    paidMethod: "Retiro",
                  });

                  if (moveRes.error) {
                    toast.error(moveRes.error);
                  } else {
                    await updateBusinessBalance(-1 * totalInput);
                    toast.success("Retiro registrado");
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

export default EditButton;
