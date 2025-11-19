import React from "react";
import clsx from "clsx";

export const Card: React.FC<{ className?: string; children?: React.ReactNode; title?: string }> = ({ className, children, title }) => {
  return (
    <div className={clsx("rounded-2xl p-4 bg-[var(--molam-surface)] shadow-sm", className)}>
      {title && <div className="text-sm font-semibold mb-2">{title}</div>}
      <div>{children}</div>
    </div>
  );
};

