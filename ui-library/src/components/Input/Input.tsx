import React from "react";
import clsx from "clsx";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...rest }, ref) => {
  return (
    <input
      ref={ref}
      className={clsx("w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none", className)}
      {...rest}
    />
  );
});
Input.displayName = "Input";

