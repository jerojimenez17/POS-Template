"use client";

import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import { BillContext } from "@/context/BillContext";

interface Props {
  productId: string;
  salePrice: number;
}

const PriceEditInput = ({ productId, salePrice }: Props) => {
  const { dispatch, focusPriceProductId, setFocusPriceProductId } =
    useContext(BillContext);
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const consumedFocusRequestRef = useRef<string | null>(null);
  const setInputRef = useCallback(
    (input: HTMLInputElement | null) => {
      inputRef.current = input;
      if (input && focusPriceProductId === productId && !isEditing) {
        setIsEditing(true);
      }
    },
    [focusPriceProductId, isEditing, productId],
  );

  // Enter edit mode first so the input can mount, then focus and consume the
  // request on the following effect pass. This also handles requests that
  // arrive before this product is rendered.
  useEffect(() => {
    if (focusPriceProductId !== productId) {
      if (focusPriceProductId === null) {
        consumedFocusRequestRef.current = null;
      }
      return;
    }

    if (consumedFocusRequestRef.current === focusPriceProductId) {
      return;
    }

    if (inputRef.current) {
      inputRef.current.focus();
      consumedFocusRequestRef.current = focusPriceProductId;
      setFocusPriceProductId?.(null);
    }
  }, [focusPriceProductId, productId, setFocusPriceProductId]);

  const handleBlur = () => {
    setIsEditing(false);
    const parsed = parseFloat((inputRef.current?.value ?? "").replace(",", "."));
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

  if (isEditing || focusPriceProductId === productId) {
    return (
      <input
        ref={setInputRef}
        type="text"
        inputMode="decimal"
        defaultValue={salePrice.toString()}
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
