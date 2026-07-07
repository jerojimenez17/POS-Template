"use client";

import React, { useState, useRef, useEffect } from "react";

interface InlineAmountInputProps {
  /** Current product amount */
  amount: number;
  /** Product ID for update callback */
  productId: string;
  /** Callback invoked when amount is confirmed (Enter/blur with valid value) */
  updateAmount: (productId: string, newAmount: number) => void;
}

const InlineAmountInput = ({
  amount,
  productId,
  updateAmount,
}: InlineAmountInputProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const cachedOriginal = useRef(amount);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleDoubleClick = () => {
    setIsEditing(true);
    setEditValue(String(amount));
    cachedOriginal.current = amount;
  };

  const parseValue = (value: string): number | null => {
    const normalized = value.replace(",", ".");
    const parsed = parseFloat(normalized);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
    return null;
  };

  const handleSave = () => {
    const parsed = parseValue(editValue);
    if (parsed !== null) {
      updateAmount(productId, parsed);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleSave}
        className="w-12 text-center font-medium tabular-nums focus-visible:ring-2 focus-visible:ring-blue-500 outline-none border border-gray-300 rounded"
        aria-label="Editar cantidad"
        autoComplete="off"
      />
    );
  }

  return (
    <span
      className="w-12 text-center font-medium tabular-nums"
      onDoubleClick={handleDoubleClick}
    >
      {amount}
    </span>
  );
};

export default InlineAmountInput;
