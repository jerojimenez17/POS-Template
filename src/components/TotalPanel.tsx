"use client";
import React, { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/firebase/config";

const TotalPanel = () => {
  const [total, setTotal] = useState(0);
  useEffect(() => {
    try {
      onSnapshot(
        doc(db, "cashRegister", "DjnQREkrJnRkXiY4p3a5"),
        (snapshot) => {
          setTotal(snapshot.data()?.Total);
        }
      );
    } catch (err) {
      console.error(err);
    }
  }, []);
  return (
    <div className="backdrop-blur-sm w-1/3 h-44 my-10 mx-auto items-center shadow-md">
      <p className="text-xl font-semibold text-gray-800">
        Total: $
        {total.toLocaleString("es-AR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
      </p>
    </div>
  );
};

export default TotalPanel;
