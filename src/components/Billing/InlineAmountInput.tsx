"use client";

import React, { useState, useRef, useEffect } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";

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
    if (isNaN(parsed)) return null;
    return Math.max(1, parsed);
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
      <Tooltip.Provider>
        <Tooltip.Root open={isEditing}>
          <Tooltip.Trigger asChild>
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
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              side="top"
              sideOffset={4}
              className="z-50 rounded-md bg-gray-900 px-2.5 py-1.5 text-xs text-white shadow-sm"
            >
              Enter confirma · Escape cancela
              <Tooltip.Arrow className="fill-gray-900" />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </Tooltip.Provider>
    );
  }

  return (
    <Tooltip.Provider>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span
            className="w-12 text-center font-medium tabular-nums cursor-pointer"
            onDoubleClick={handleDoubleClick}
          >
            {amount}
          </span>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            sideOffset={4}
            className="z-50 rounded-md bg-gray-900 px-2.5 py-1.5 text-xs text-white shadow-sm"
          >
            Doble click para editar cantidad
            <Tooltip.Arrow className="fill-gray-900" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
};

export default InlineAmountInput;
