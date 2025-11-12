import React from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import clsx from 'clsx';

interface KPICardProps {
  title: string;
  value: string;
  change?: string;
  trend?: 'up' | 'down';
  loading?: boolean;
}

export default function KPICard({ title, value, change, trend, loading }: KPICardProps) {
  if (loading) {
    return (
      <div className="card card-hover animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-1/2 mb-3"></div>
        <div className="h-8 bg-gray-200 rounded w-3/4"></div>
      </div>
    );
  }

  return (
    <div className="card card-hover">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs uppercase text-gray-500 font-medium tracking-wide">
            {title}
          </p>
          <p className="text-2xl font-semibold text-gray-900 mt-2">
            {value}
          </p>
        </div>

        {change && trend && (
          <div
            className={clsx(
              'flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium',
              trend === 'up' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            )}
          >
            {trend === 'up' ? (
              <ArrowUp className="w-3 h-3" />
            ) : (
              <ArrowDown className="w-3 h-3" />
            )}
            <span>{change}</span>
          </div>
        )}
      </div>
    </div>
  );
}
