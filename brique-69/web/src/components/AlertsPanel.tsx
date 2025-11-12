import React from 'react';
import { AlertTriangle, Info, AlertCircle } from 'lucide-react';
import clsx from 'clsx';
import { formatDistanceToNow } from 'date-fns';

interface AlertsPanelProps {
  alerts: any[];
  loading?: boolean;
}

export default function AlertsPanel({ alerts, loading }: AlertsPanelProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse">
            <div className="h-16 bg-gray-200 rounded"></div>
          </div>
        ))}
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <Info className="w-12 h-12 mx-auto mb-3 opacity-20" />
        <p>No active alerts</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={clsx(
            'p-4 rounded-xl border-l-4 transition-colors hover:bg-gray-50',
            alert.severity === 'critical' && 'border-red-500 bg-red-50',
            alert.severity === 'warn' && 'border-yellow-500 bg-yellow-50',
            alert.severity === 'info' && 'border-blue-500 bg-blue-50'
          )}
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5">
              {alert.severity === 'critical' && (
                <AlertCircle className="w-5 h-5 text-red-600" />
              )}
              {alert.severity === 'warn' && (
                <AlertTriangle className="w-5 h-5 text-yellow-600" />
              )}
              {alert.severity === 'info' && (
                <Info className="w-5 h-5 text-blue-600" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">
                {alert.title}
              </p>
              {alert.description && (
                <p className="text-xs text-gray-600 mt-1">
                  {alert.description}
                </p>
              )}
              <p className="text-xs text-gray-500 mt-2">
                {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
              </p>
            </div>

            <button className="text-xs px-3 py-1 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 transition-colors font-medium">
              View
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
