import React, { useEffect, useState } from 'react';
import { Calendar, Download, FileText, Trash2, Play, Pause, Plus } from 'lucide-react';
import { format } from 'date-fns';
import ExportModal, { ExportConfig } from '../components/ExportModal';
import ScheduleReportModal from '../components/ScheduleReportModal';
import { exportReport, fetchReportSchedules, fetchReportHistory } from '../utils/api';

export default function Reports() {
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReports();
  }, []);

  async function loadReports() {
    setLoading(true);
    try {
      const [schedulesData, historyData] = await Promise.all([
        fetchReportSchedules('active'),
        fetchReportHistory(50),
      ]);

      setSchedules(schedulesData);
      setHistory(historyData.reports || []);
    } catch (error) {
      console.error('Error loading reports:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleExport(config: ExportConfig) {
    try {
      const result = await exportReport(config);

      // Download the file
      window.open(result.downloadUrl, '_blank');

      // Refresh history
      await loadReports();
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to generate report. Please try again.');
    }
  }

  async function handleCreateSchedule(scheduleConfig: any) {
    // This would call the API to create a schedule
    console.log('Creating schedule:', scheduleConfig);
    await loadReports();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-semibold text-gray-900">Reports & Exports</h2>
          <p className="text-sm text-gray-600 mt-1">Generate and schedule analytics reports</p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setScheduleModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Calendar className="w-4 h-4" />
            Schedule Report
          </button>
          <button
            onClick={() => setExportModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export Now
          </button>
        </div>
      </div>

      {/* Scheduled Reports */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Scheduled Reports</h3>
          <button
            onClick={() => setScheduleModalOpen(true)}
            className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
          >
            <Plus className="w-4 h-4" />
            Add Schedule
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center">
            <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          </div>
        ) : schedules.length === 0 ? (
          <div className="py-12 text-center text-gray-500">
            <Calendar className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p>No scheduled reports yet</p>
            <button
              onClick={() => setScheduleModalOpen(true)}
              className="mt-3 text-primary-600 hover:text-primary-700 font-medium text-sm"
            >
              Create your first schedule
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs uppercase text-gray-500 border-b">
                  <th className="pb-3 font-medium">Name</th>
                  <th className="pb-3 font-medium">Format</th>
                  <th className="pb-3 font-medium">Schedule</th>
                  <th className="pb-3 font-medium">Next Run</th>
                  <th className="pb-3 font-medium">Recipients</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {schedules.map((schedule) => (
                  <tr key={schedule.id} className="hover:bg-gray-50">
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-gray-400" />
                        <span className="font-medium text-gray-900">{schedule.name}</span>
                      </div>
                    </td>
                    <td className="py-3 text-sm text-gray-600">{schedule.format.toUpperCase()}</td>
                    <td className="py-3 text-sm text-gray-600">{schedule.cron_expr}</td>
                    <td className="py-3 text-sm text-gray-600">
                      {schedule.next_run_at ? format(new Date(schedule.next_run_at), 'MMM dd, HH:mm') : 'N/A'}
                    </td>
                    <td className="py-3 text-sm text-gray-600">
                      {JSON.parse(schedule.recipients || '[]').length} recipient(s)
                    </td>
                    <td className="py-3">
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-lg text-xs font-medium ${
                          schedule.status === 'active'
                            ? 'bg-green-50 text-green-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {schedule.status}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <button className="p-1 hover:bg-gray-100 rounded">
                          {schedule.is_enabled ? (
                            <Pause className="w-4 h-4 text-gray-600" />
                          ) : (
                            <Play className="w-4 h-4 text-gray-600" />
                          )}
                        </button>
                        <button className="p-1 hover:bg-gray-100 rounded">
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Export History */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Exports</h3>

        {history.length === 0 ? (
          <div className="py-12 text-center text-gray-500">
            <Download className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p>No exports yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((report) => (
              <div
                key={report.id}
                className="flex items-center justify-between p-4 border rounded-xl hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary-50 rounded-lg">
                    <FileText className="w-5 h-5 text-primary-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{report.report_name}</p>
                    <p className="text-sm text-gray-600">
                      {format(new Date(report.created_at), 'MMM dd, yyyy HH:mm')} •{' '}
                      {report.format.toUpperCase()} • {report.row_count} rows
                    </p>
                  </div>
                </div>

                <a
                  href={report.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Download
                </a>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <ExportModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        onExport={handleExport}
      />

      <ScheduleReportModal
        isOpen={scheduleModalOpen}
        onClose={() => setScheduleModalOpen(false)}
        onCreate={handleCreateSchedule}
      />
    </div>
  );
}
