import React from "react";
import clsx from "clsx";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline" | "danger",
  size?: "sm" | "md" | "lg"
};

export const Button: React.FC<ButtonProps> = ({ variant = "primary", size = "md", className, children, ...rest }) => {
  const base = "inline-flex items-center justify-center font-medium rounded-2xl transition-all";
  const sizeMap = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-4 py-2 text-sm",
    lg: "px-5 py-3 text-base"
  };
  const variantClasses = {
    primary: "bg-[var(--molam-primary)] text-[var(--molam-on-primary)] shadow-sm hover:brightness-95",
    ghost: "bg-transparent text-[var(--molam-text)] hover:bg-[var(--molam-surface)]",
    outline: "bg-white border border-gray-200 text-[var(--molam-text)]",
    danger: "bg-red-600 text-white"
  };

  return (
    <button
      className={clsx(base, sizeMap[size], variantClasses[variant], "focus:outline-none focus:ring-2 focus:ring-offset-2", className)}
      {...rest}
    >
      {children}
    </button>
  );
};

export default Button;

