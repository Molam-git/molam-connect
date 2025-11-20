import React from "react";

export const Table: React.FC<{ columns: string[]; rows: React.ReactNode[] }> = ({ columns, rows }) => {
  return (
    <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
      <table className="min-w-full text-sm">
        <thead className="bg-white">
          <tr>
            {columns.map((c,i)=>(<th key={i} className="text-left p-3 text-xs text-gray-500">{c}</th>))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r,i)=>(<tr key={i} className="border-t">{r}</tr>))}
        </tbody>
      </table>
    </div>
  );
};

