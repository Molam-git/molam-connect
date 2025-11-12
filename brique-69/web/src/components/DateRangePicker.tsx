import React from 'react';
import { Calendar } from 'lucide-react';

interface DateRangePickerProps {
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
}

export default function DateRangePicker({ from, to, onChange }: DateRangePickerProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-xl bg-white">
      <Calendar className="w-4 h-4 text-gray-500" />
      <input
        type="date"
        value={from}
        onChange={(e) => onChange({ from: e.target.value, to })}
        className="text-sm focus:outline-none"
      />
      <span className="text-gray-400">—</span>
      <input
        type="date"
        value={to}
        onChange={(e) => onChange({ from, to: e.target.value })}
        className="text-sm focus:outline-none"
      />
    </div>
  );
}
