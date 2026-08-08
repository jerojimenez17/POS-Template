"use client";

import React, { useContext, useEffect, useRef, useState } from "react";
import { BillContext } from "@/context/BillContext";

interface Props {
  productId: string;
  salePrice: number;
}

const PriceEditInput = ({ productId, salePrice }: Props) => {
  const { dispatch, focusPriceProductId, setFocusPriceProductId } =
    useContext(BillContext);
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(salePrice.toString());
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus when this product's price should be focused
  useEffect(() => {
    if (focusPriceProductId === productId && inputRef.current) {
      inputRef.current.focus();
      setIsEditing(true);
      setValue(salePrice.toString());
      setFocusPriceProductId(null);
    }
  }, [focusPriceProductId, productId, salePrice, setFocusPriceProductId]);

  // Sync value when salePrice changes externally
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!isEditing) {
      setValue(salePrice.toString());
    }
  }, [salePrice, isEditing]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleBlur = () => {
    setIsEditing(false);
    const parsed = parseFloat(value.replace(",", "."));
    if (!isNaN(parsed) && parsed >= 0) {
      dispatch({
        type: "updateSalePrice",
        payload: { id: productId, salePrice: parsed },
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleBlur();
    }
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="w-24 text-right font-medium tabular-nums border border-blue-400 rounded px-1 py-0.5 focus-visible:ring-2 focus-visible:ring-blue-500 outline-none transition-shadow"
        aria-label={`Precio del producto ${productId}`}
        autoComplete="off"
        spellCheck={false}
      />
    );
  }

  return (
    <button
      onClick={() => {
        setValue(salePrice.toString());
        setIsEditing(true);
      }}
      className="w-24 text-right font-medium tabular-nums hover:bg-gray-100 dark:hover:bg-gray-700 rounded px-1 py-0.5 transition-colors cursor-text"
      aria-label={`Precio del producto ${productId}`}
    >
      ${salePrice.toLocaleString("es-AR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}
    </button>
  );
};

export default PriceEditInput;
