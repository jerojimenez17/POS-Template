"use client";

import React, { useContext, useState, useEffect, useCallback } from "react";
import { BillContext } from "@/context/BillContext";

interface DiscountControlProps {
  editable?: boolean;
  className?: string;
}

const DiscountControl = ({
  editable = true,
  className,
}: DiscountControlProps) => {
  const { BillState, dispatch } = useContext(BillContext);
  const [editValue, setEditValue] = useState<string>(
    String(BillState.discount)
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEditValue(String(BillState.discount));
  }, [BillState.discount]);

  const commitValue = useCallback(
    (raw: string) => {
      if (!editable) return;
      const parsed = Number(raw);
      let clamped = isNaN(parsed) ? 0 : parsed;
      if (clamped < 0) clamped = 0;
      if (clamped > 100) clamped = 100;
      dispatch({ type: "discount", payload: clamped });
    },
    [editable, dispatch]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditValue(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitValue(editValue);
    }
    if (e.key === "Escape") {
      setEditValue(String(BillState.discount));
    }
  };

  const handleBlur = () => {
    commitValue(editValue);
  };

  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <label
        htmlFor="discount-input"
        className="text-sm text-gray-500 dark:text-gray-400"
      >
        Descuento
      </label>
      <div className="relative">
        <input
          id="discount-input"
          type="number"
          aria-label="Porcentaje de descuento"
          inputMode="numeric"
          autoComplete="off"
          className="h-8 w-20 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 text-right text-sm tabular-nums focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          value={editValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          disabled={!editable}
          readOnly={!editable}
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">
          %
        </span>
      </div>
    </div>
  );
};

export default DiscountControl;
