import React, { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import clsx from 'clsx';

interface ScheduleReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (config: any) => Promise<void>;
}

export default function ScheduleReportModal({ isOpen, onClose, onCreate }: ScheduleReportModalProps) {
  const [name, setName] = useState('');
  const [format, setFormat] = useState<'csv' | 'xlsx' | 'pdf'>('xlsx');
  const [schedule, setSchedule] = useState('daily');
  const [recipients, setRecipients] = useState<Array<{ email: string }>>([{ email: '' }]);
  const [loading, setLoading] = useState(false);

  const scheduleOptions = [
    { value: 'daily', label: 'Daily at 8:00 AM', cron: '0 8 * * *' },
    { value: 'weekly', label: 'Weekly (Monday 8:00 AM)', cron: '0 8 * * 1' },
    { value: 'monthly', label: 'Monthly (1st at 8:00 AM)', cron: '0 8 1 * *' },
  ];

  const handleCreate = async () => {
    if (!name || recipients.some(r => !r.email)) {
      alert('Please fill in all required fields');
      return;
    }

    setLoading(true);
    try {
      const selectedSchedule = scheduleOptions.find(s => s.value === schedule);

      await onCreate({
        name,
        format,
        cronExpr: selectedSchedule?.cron,
        recipients: recipients.filter(r => r.email),
        queryParams: {
          // Default query params
          granularity: 'day',
          metrics: ['gross_volume_usd', 'net_revenue_usd', 'fees_molam_usd'],
          dimensions: ['day', 'country'],
        },
      });

      onClose();
      // Reset form
      setName('');
      setRecipients([{ email: '' }]);
    } catch (error) {
      console.error('Failed to create schedule:', error);
      alert('Failed to create schedule');
    } finally {
      setLoading(false);
    }
  };

  const addRecipient = () => {
    setRecipients([...recipients, { email: '' }]);
  };

  const removeRecipient = (index: number) => {
    setRecipients(recipients.filter((_, i) => i !== index));
  };

  const updateRecipient = (index: number, email: string) => {
    const updated = [...recipients];
    updated[index] = { email };
    setRecipients(updated);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-2xl shadow-apple-lg w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white z-10 rounded-t-2xl">
          <h3 className="text-xl font-semibold text-gray-900">Schedule Report</h3>
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
              Report Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Weekly Performance Report"
            />
          </div>

          {/* Format */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Format
            </label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="csv">CSV</option>
              <option value="xlsx">Excel (XLSX)</option>
              <option value="pdf">PDF</option>
            </select>
          </div>

          {/* Schedule */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Schedule
            </label>
            <select
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {scheduleOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Recipients */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Recipients *
              </label>
              <button
                onClick={addRecipient}
                className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                Add Recipient
              </button>
            </div>

            <div className="space-y-2">
              {recipients.map((recipient, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="email"
                    value={recipient.email}
                    onChange={(e) => updateRecipient(index, e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="email@example.com"
                  />
                  {recipients.length > 1 && (
                    <button
                      onClick={() => removeRecipient(index)}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              Recipients will receive an email with a secure download link when the report is generated.
              The link will expire after 24 hours.
            </p>
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
            onClick={handleCreate}
            disabled={loading || !name || recipients.some(r => !r.email)}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-xl hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating...' : 'Create Schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}
