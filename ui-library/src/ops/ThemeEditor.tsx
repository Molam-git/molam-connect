import React, { useState } from "react";

/**
 * Simple Ops UI to edit CSS variables (in-memory). In prod: persist to DB with RBAC.
 */
export function ThemeEditor(){
  const [primary, setPrimary] = useState(document.documentElement.style.getPropertyValue("--molam-primary") || "#0A84FF");
  function apply(){
    document.documentElement.style.setProperty("--molam-primary", primary);
  }
  return (
    <div className="p-6 max-w-xl">
      <h2 className="text-xl font-semibold mb-4">Theme Editor (Ops)</h2>
      <label className="block mb-2">Primary color</label>
      <input value={primary} onChange={e=>setPrimary(e.target.value)} className="p-2 border rounded" />
      <div className="mt-4">
        <button className="px-4 py-2 rounded-2xl bg-[var(--molam-primary)] text-white" onClick={apply}>Apply</button>
      </div>
    </div>
  );
}

