"use client";
import React, { useState } from "react";
import { addToTotal } from "../services/firebaseService";
import { Input } from "./ui/input";
import Movement from "@/models/Movement";
import newMovement from "@/firebase/cashMovements/newMovement";
import { Session } from "next-auth";

interface props {
  session: Session | null;
}
const EditButton = ({ session }: props) => {
  const [openTotalInput, setOpenTotalInput] = useState(false);

  const [totalInput, setTotalInput] = useState(0);
  const [loading, setLoading] = useState(false);
  return (
    <div className="flex flex-col h-20 max-h-54 w-1/4">
      <div
        className="backdrop-blur-sm text-lg h-full w-full my-2 mx-auto font-semibold shadow-sm shadow-gray-300 text-gray-800 hover:shadow-lg hover:shadow-gray-500"
        onClick={() => setOpenTotalInput(!openTotalInput)}
      >
        Retiro
      </div>
      {openTotalInput && (
        <Input
          disabled={loading}
          type="number"
          className="text-gray-900"
          value={totalInput !== 0 ? totalInput : ""}
          placeholder="Retiro"
          onChange={(e) => {
            setTotalInput(Number(e.currentTarget.value));
          }}
          onKeyDown={async (e) => {
            if (e.key === "Enter") {
              setLoading(true);
              const move: Movement = new Movement();
              move.seller = session?.user?.email ? session?.user.email : "";
              move.paidMethod = "Retiro";
              move.total = -1 * totalInput;
              await newMovement(move);
              await addToTotal(-1 * totalInput);
              setTotalInput(0);
              setLoading(false);
            }
          }}
        />
      )}
    </div>
  );
};

export default EditButton;
