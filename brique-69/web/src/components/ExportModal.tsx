import React, { useState } from 'react';
import { X, Download, FileText, FileSpreadsheet } from 'lucide-react';
import { format, subDays } from 'date-fns';
import clsx from 'clsx';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (config: ExportConfig) => Promise<void>;
}

export interface ExportConfig {
  format: 'csv' | 'xlsx' | 'pdf';
  reportName: string;
  queryParams: {
    from: string;
    to: string;
    granularity: 'hour' | 'day';
    metrics: string[];
    dimensions: string[];
  };
}

export default function ExportModal({ isOpen, onClose, onExport }: ExportModalProps) {
  const [format, setFormat] = useState<'csv' | 'xlsx' | 'pdf'>('csv');
  const [reportName, setReportName] = useState('Analytics Export');
  const [dateRange, setDateRange] = useState({
    from: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    to: format(new Date(), 'yyyy-MM-dd'),
  });
  const [granularity, setGranularity] = useState<'hour' | 'day'>('day');
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      await onExport({
        format,
        reportName,
        queryParams: {
          from: dateRange.from,
          to: dateRange.to,
          granularity,
          metrics: ['gross_volume_usd', 'net_revenue_usd', 'fees_molam_usd', 'tx_count'],
          dimensions: granularity === 'day' ? ['day', 'country'] : ['hour', 'country'],
        },
      });
      onClose();
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-2xl shadow-apple-lg w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h3 className="text-xl font-semibold text-gray-900">Export Report</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Report Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Report Name
            </label>
            <input
              type="text"
              value={reportName}
              onChange={(e) => setReportName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Analytics Export"
            />
          </div>

          {/* Format Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Format
            </label>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => setFormat('csv')}
                className={clsx(
                  'p-4 border-2 rounded-xl flex flex-col items-center gap-2 transition-all',
                  format === 'csv'
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300'
                )}
              >
                <FileText className={clsx('w-6 h-6', format === 'csv' ? 'text-primary-600' : 'text-gray-400')} />
                <span className={clsx('text-sm font-medium', format === 'csv' ? 'text-primary-700' : 'text-gray-600')}>
                  CSV
                </span>
              </button>

              <button
                onClick={() => setFormat('xlsx')}
                className={clsx(
                  'p-4 border-2 rounded-xl flex flex-col items-center gap-2 transition-all',
                  format === 'xlsx'
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300'
                )}
              >
                <FileSpreadsheet className={clsx('w-6 h-6', format === 'xlsx' ? 'text-primary-600' : 'text-gray-400')} />
                <span className={clsx('text-sm font-medium', format === 'xlsx' ? 'text-primary-700' : 'text-gray-600')}>
                  Excel
                </span>
              </button>

              <button
                onClick={() => setFormat('pdf')}
                className={clsx(
                  'p-4 border-2 rounded-xl flex flex-col items-center gap-2 transition-all',
                  format === 'pdf'
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300'
                )}
              >
                <FileText className={clsx('w-6 h-6', format === 'pdf' ? 'text-primary-600' : 'text-gray-400')} />
                <span className={clsx('text-sm font-medium', format === 'pdf' ? 'text-primary-700' : 'text-gray-600')}>
                  PDF
                </span>
              </button>
            </div>
          </div>

          {/* Date Range */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Date Range
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <input
                  type="date"
                  value={dateRange.from}
                  onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <input
                  type="date"
                  value={dateRange.to}
                  onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
          </div>

          {/* Granularity */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Granularity
            </label>
            <select
              value={granularity}
              onChange={(e) => setGranularity(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="day">Daily</option>
              <option value="hour">Hourly</option>
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t bg-gray-50 rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-xl hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Generating...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Export
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
