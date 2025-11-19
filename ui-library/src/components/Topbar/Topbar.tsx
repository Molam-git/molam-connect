import React from "react";
import { Button } from "../Button/Button";

export const Topbar: React.FC<{ title?: string; onToggleTheme?: ()=>void }> = ({ title="Molam", onToggleTheme }) => {
  return (
    <header className="bg-[var(--molam-bg)] p-4 border-b">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-full w-9 h-9 bg-[var(--molam-primary)] flex items-center justify-center text-white font-bold">M</div>
          <div className="font-semibold">{title}</div>
        </div>
        <div>
          <Button variant="ghost" onClick={onToggleTheme}>Theme</Button>
        </div>
      </div>
    </header>
  );
};

