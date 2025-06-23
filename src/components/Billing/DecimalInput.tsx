"use client";

import Product from "@/models/Product";
import React, { useEffect, useState } from "react";
interface Props {
  initial: number;
  product: Product;
  updateAmount: (id: string, amount: number) => void;
}

const DecimalInput = ({ initial, product, updateAmount }: Props) => {
  const [value, setValue] = useState(initial.toString().replace(".", ","));
  const [error, setError] = useState("");

  useEffect(() => {
    const timeout = setTimeout(() => setError(""), 3000);
    return () => clearTimeout(timeout);
  }, [error]);

  const handleBlur = () => {
    const parsed = parseFloat(value.replace(",", "."));
    if (!isNaN(parsed) && parsed > 0) {
      updateAmount(product.id, parsed);
      setError("");
    } else {
      setError("Cantidad inválida");
    }
  };
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleBlur();
    }
  };
  return (
    <div className="flex flex-col items-center">
      <input
        className="w-20 border border-gray-400 rounded px-1 text-center"
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />
      {error && <span className="text-red-500 text-sm">{error}</span>}
    </div>
  );
};

export default DecimalInput;
