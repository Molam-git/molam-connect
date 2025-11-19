/**
 * BRIQUE 145 — Analytics Dashboard
 * Real-time analytics dashboard with WebSocket updates
 */
import { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import KPICard from './KPICard';
import TimeSeriesChart from './TimeSeriesChart';
import CountryBreakdown from './CountryBreakdown';
import FilterBar from './FilterBar';

interface AnalyticsDashboardProps {
  token: string;
}

interface Overview {
  gmv: number;
  tx_count: number;
  fees_total: number;
  refunds_amount: number;
  disputes_count: number;
}

interface Filter {
  from?: string;
  to?: string;
  zone?: string;
  country?: string;
  city?: string;
  currency?: string;
}

export default function AnalyticsDashboard({ token }: AnalyticsDashboardProps) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [overview, setOverview] = useState<Overview>({
    gmv: 0,
    tx_count: 0,
    fees_total: 0,
    refunds_amount: 0,
    disputes_count: 0
  });
  const [filter, setFilter] = useState<Filter>({
    from: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    to: new Date().toISOString()
  });
  const [isLive, setIsLive] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string>('');

  // Fetch overview data
  const fetchOverview = async () => {
    try {
      const params = new URLSearchParams(filter as any);
      const response = await fetch(`/api/analytics/overview?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch overview');
      }

      const data = await response.json();
      setOverview(data);
      setLastUpdate(new Date().toISOString());
    } catch (error) {
      console.error('Error fetching overview:', error);
    }
  };

  // Setup WebSocket connection
  useEffect(() => {
    const wsUrl = import.meta.env.VITE_WS_URL || 'http://localhost:3003';
    const newSocket = io(wsUrl, {
      auth: { token }
    });

    newSocket.on('connect', () => {
      console.log('✅ WebSocket connected');
      setIsLive(true);

      // Subscribe to updates based on current filter
      newSocket.emit('subscribe', {
        zone: filter.zone,
        country: filter.country,
        city: filter.city
      });
    });

    newSocket.on('disconnect', () => {
      console.log('❌ WebSocket disconnected');
      setIsLive(false);
    });

    newSocket.on('analytics:delta', (delta) => {
      console.log('📊 Received delta:', delta);

      // Apply delta to current overview
      setOverview(prev => ({
        gmv: prev.gmv + (delta.amount || 0),
        tx_count: prev.tx_count + 1,
        fees_total: prev.fees_total + (delta.fee || 0),
        refunds_amount: prev.refunds_amount + (delta.refund_amount || 0),
        disputes_count: prev.disputes_count + (delta.dispute ? 1 : 0)
      }));

      setLastUpdate(new Date().toISOString());
    });

    newSocket.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [token, filter.zone, filter.country, filter.city]);

  // Initial data fetch
  useEffect(() => {
    fetchOverview();
  }, [filter]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: filter.currency || 'XOF',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('fr-FR').format(num);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Analytics Dashboard</h1>
              <p className="text-sm text-gray-500 mt-1">
                Last update: {new Date(lastUpdate).toLocaleString('fr-FR')}
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center">
                <div className={`h-2 w-2 rounded-full ${isLive ? 'bg-green-500' : 'bg-red-500'} mr-2`}></div>
                <span className="text-sm text-gray-600">
                  {isLive ? 'Live' : 'Disconnected'}
                </span>
              </div>
              <button
                onClick={fetchOverview}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filters */}
        <FilterBar filter={filter} onFilterChange={setFilter} />

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
          <KPICard
            title="GMV"
            value={formatCurrency(overview.gmv)}
            trend="+12.5%"
            trendUp={true}
          />
          <KPICard
            title="Transactions"
            value={formatNumber(overview.tx_count)}
            trend="+8.3%"
            trendUp={true}
          />
          <KPICard
            title="Fees Collected"
            value={formatCurrency(overview.fees_total)}
            trend="+15.2%"
            trendUp={true}
          />
          <KPICard
            title="Refunds"
            value={formatCurrency(overview.refunds_amount)}
            trend="-3.1%"
            trendUp={false}
          />
          <KPICard
            title="Disputes"
            value={formatNumber(overview.disputes_count)}
            trend="-5.2%"
            trendUp={false}
          />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <TimeSeriesChart token={token} filter={filter} />
          <CountryBreakdown token={token} filter={filter} />
        </div>
      </div>
    </div>
  );
}
