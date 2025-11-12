import React, { useEffect, useState } from 'react';
import { format, subDays } from 'date-fns';
import KPICard from '../components/KPICard';
import TimeseriesChart from '../components/TimeseriesChart';
import TopMerchantsTable from '../components/TopMerchantsTable';
import AlertsPanel from '../components/AlertsPanel';
import DateRangePicker from '../components/DateRangePicker';
import { fetchKPIs, fetchTimeseries, fetchTopMerchants, fetchAlerts } from '../utils/api';

export default function Dashboard() {
  const [dateRange, setDateRange] = useState({
    from: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    to: format(new Date(), 'yyyy-MM-dd'),
  });
  const [granularity, setGranularity] = useState<'day' | 'hour'>('day');
  const [loading, setLoading] = useState(true);

  const [kpis, setKpis] = useState({
    gross_volume: 0,
    net_revenue: 0,
    fees_collected: 0,
    refunds: 0,
    tx_count: 0,
    success_rate: 0,
  });

  const [timeseries, setTimeseries] = useState<any[]>([]);
  const [topMerchants, setTopMerchants] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);

  useEffect(() => {
    loadDashboardData();
  }, [dateRange, granularity]);

  async function loadDashboardData() {
    setLoading(true);
    try {
      const [kpisData, timeseriesData, merchantsData, alertsData] = await Promise.all([
        fetchKPIs(dateRange.from, dateRange.to),
        fetchTimeseries('gross', dateRange.from, dateRange.to, granularity),
        fetchTopMerchants(dateRange.from, dateRange.to, 5),
        fetchAlerts('open', 10),
      ]);

      setKpis(kpisData);
      setTimeseries(timeseriesData);
      setTopMerchants(merchantsData);
      setAlerts(alertsData.alerts || []);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-semibold text-gray-900">Overview</h2>
          <p className="text-sm text-gray-600 mt-1">Real-time analytics dashboard</p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={granularity}
            onChange={(e) => setGranularity(e.target.value as any)}
            className="px-4 py-2 border border-gray-300 rounded-xl bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="day">Daily</option>
            <option value="hour">Hourly</option>
          </select>

          <DateRangePicker
            from={dateRange.from}
            to={dateRange.to}
            onChange={setDateRange}
          />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Gross Volume"
          value={`$${kpis.gross_volume.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          change="+12.5%"
          trend="up"
          loading={loading}
        />
        <KPICard
          title="Net Revenue"
          value={`$${kpis.net_revenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          change="+8.3%"
          trend="up"
          loading={loading}
        />
        <KPICard
          title="Fees Collected"
          value={`$${kpis.fees_collected.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          change="+15.2%"
          trend="up"
          loading={loading}
        />
        <KPICard
          title="Success Rate"
          value={`${kpis.success_rate.toFixed(1)}%`}
          change="-0.5%"
          trend="down"
          loading={loading}
        />
      </div>

      {/* Timeseries Chart */}
      <div className="card card-hover">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Transaction Volume</h3>
          <div className="flex gap-2">
            <button className="text-xs px-3 py-1 rounded-lg bg-primary-50 text-primary-700 font-medium">
              Volume
            </button>
            <button className="text-xs px-3 py-1 rounded-lg hover:bg-gray-100 text-gray-600">
              Revenue
            </button>
            <button className="text-xs px-3 py-1 rounded-lg hover:bg-gray-100 text-gray-600">
              Fees
            </button>
          </div>
        </div>
        <TimeseriesChart data={timeseries} loading={loading} />
      </div>

      {/* Bottom Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card card-hover">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Merchants</h3>
          <TopMerchantsTable merchants={topMerchants} loading={loading} />
        </div>

        <div className="card card-hover">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Alerts</h3>
          <AlertsPanel alerts={alerts} loading={loading} />
        </div>
      </div>
    </div>
  );
}
