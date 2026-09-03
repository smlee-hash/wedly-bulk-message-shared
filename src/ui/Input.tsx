"use client";

import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "./cn";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-wedly-t1">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={id}
        className={cn(
          "h-9 rounded-lg border border-wedly-bd bg-white px-3 text-sm text-wedly-t1",
          "placeholder:text-wedly-muted",
          "focus:outline-none focus:ring-2 focus:ring-wedly-accent focus:border-transparent",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          error && "border-wedly-red focus:ring-wedly-red",
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-wedly-red">{error}</p>}
    </div>
  )
);

Input.displayName = "Input";
