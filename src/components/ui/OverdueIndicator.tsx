"use client";

import * as Tooltip from "@radix-ui/react-tooltip";

/**
 * OverdueIndicator — a red circle dot that indicates an overdue account.
 *
 * Renders a small red filled circle with a tooltip on hover explaining
 * that the account is more than 30 days past due.
 *
 * Accessibility: The trigger span has an `aria-label` for screen readers.
 */
export function OverdueIndicator() {
  return (
    <Tooltip.Provider>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span
            className="inline-flex items-center justify-center w-2.5 h-2.5 rounded-full bg-red-500 cursor-help"
            aria-label="Moroso — más de 30 días sin pagar"
          />
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            sideOffset={5}
            className="bg-red-500 text-white px-2 py-1 rounded text-xs shadow-lg"
          >
            Moroso — más de 30 días sin pagar
            <Tooltip.Arrow className="fill-red-500" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
