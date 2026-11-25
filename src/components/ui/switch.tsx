"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "checked" | "onChange" | "type"> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

const Switch = forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, checked, onCheckedChange, disabled, ...props }, ref) => {
    return (
      <span
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent bg-muted transition-colors motion-reduce:transition-none",
          "has-[:focus-visible]:outline-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2",
          "has-[:checked]:bg-primary has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50",
          className,
        )}
      >
        <input
          {...props}
          ref={ref}
          type="checkbox"
          role="switch"
          aria-checked={checked}
          data-state={checked ? "checked" : "unchecked"}
          checked={checked}
          disabled={disabled}
          onChange={(event) => onCheckedChange(event.target.checked)}
          className="peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none block h-5 w-5 translate-x-0 rounded-full bg-background shadow ring-0 transition-transform duration-200 ease-in-out motion-reduce:transition-none",
            "peer-checked:translate-x-5",
          )}
        />
      </span>
    );
  }
);
Switch.displayName = "Switch";

export { Switch };
