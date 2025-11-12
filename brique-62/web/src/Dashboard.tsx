import React, { useEffect, useState } from 'react';

interface Widget {
  id: string;
  widget_type: string;
  config: any;
  sort_order: number;
}

interface Tile {
  id: string;
  tile_type: string;
  priority: string;
  payload: any;
  computed_at: string;
  source: string;
  acknowledged: boolean;
}

interface DashboardProps {
  merchantId: string;
}

export default function Dashboard({ merchantId }: DashboardProps) {
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
    // Refresh tiles every minute
    const interval = setInterval(fetchTiles, 60000);
    return () => clearInterval(interval);
  }, [merchantId]);

  const fetchDashboardData = async () => {
    setLoading(true);
    await Promise.all([fetchWidgets(), fetchTiles()]);
    setLoading(false);
  };

  const fetchWidgets = async () => {
    try {
      const response = await fetch(`/api/dashboard/${merchantId}/widgets`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await response.json();
      setWidgets(data);
    } catch (error) {
      console.error('Error fetching widgets:', error);
    }
  };

  const fetchTiles = async () => {
    try {
      const response = await fetch(`/api/dashboard/${merchantId}/tiles`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await response.json();
      setTiles(data);
    } catch (error) {
      console.error('Error fetching tiles:', error);
    }
  };

  const acknowledgeTile = async (tileId: string) => {
    try {
      await fetch(`/api/dashboard/tile/${tileId}/acknowledge`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      fetchTiles(); // Refresh tiles
    } catch (error) {
      console.error('Error acknowledging tile:', error);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'bg-red-100 border-red-500 text-red-900';
      case 'high':
        return 'bg-orange-100 border-orange-500 text-orange-900';
      case 'normal':
        return 'bg-blue-100 border-blue-500 text-blue-900';
      case 'low':
        return 'bg-gray-100 border-gray-500 text-gray-900';
      default:
        return 'bg-gray-100 border-gray-500 text-gray-900';
    }
  };

  const renderTileContent = (tile: Tile) => {
    const { tile_type, payload } = tile;

    switch (tile_type) {
      case 'churn_risk':
        return (
          <div>
            <p className="text-2xl font-bold">{payload.count}</p>
            <p className="text-sm">High-risk churn alerts</p>
            <p className="text-xs mt-2">Highest risk: {payload.highest_risk}%</p>
          </div>
        );

      case 'fraud_alerts':
        return (
          <div>
            <p className="text-2xl font-bold text-red-600">{payload.count}</p>
            <p className="text-sm">{payload.message}</p>
          </div>
        );

      case 'balance_summary':
        return (
          <div>
            <p className="text-sm font-semibold mb-2">Wallet Balances</p>
            {payload.balances?.map((b: any, idx: number) => (
              <p key={idx} className="text-sm">
                {b.currency}: {b.balance.toFixed(2)}
              </p>
            ))}
          </div>
        );

      case 'disputes_pending':
        return (
          <div>
            <p className="text-2xl font-bold">{payload.count}</p>
            <p className="text-sm">Pending disputes</p>
            <p className="text-xs mt-2">Total: ${payload.total_amount?.toFixed(2)}</p>
          </div>
        );

      case 'subscriptions_mrr':
        return (
          <div>
            <p className="text-xs font-semibold mb-1">MRR</p>
            <p className="text-2xl font-bold">${payload.mrr?.toFixed(0)}</p>
            <p className="text-xs mt-2">
              {payload.active_count} active subscriptions · {payload.churn_rate?.toFixed(1)}% churn
            </p>
          </div>
        );

      default:
        return <pre className="text-xs">{JSON.stringify(payload, null, 2)}</pre>;
    }
  };

  const renderWidget = (widget: Widget) => {
    const { widget_type, config } = widget;

    return (
      <div className="bg-white shadow rounded-lg p-4">
        <h4 className="text-sm font-bold mb-3 capitalize">{widget_type.replace(/_/g, ' ')}</h4>
        <div className="text-sm text-gray-600">
          {/* Widget-specific content would be rendered here */}
          <p>Widget configuration:</p>
          <pre className="text-xs mt-2 bg-gray-50 p-2 rounded">{JSON.stringify(config, null, 2)}</pre>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-gray-500">Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Merchant Dashboard</h1>
          <p className="text-gray-600">Unified view of Wallet, Connect, Subscriptions & Disputes</p>
        </div>

        {/* Alert Tiles */}
        {tiles.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-3 text-gray-800">Alerts & Notifications</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {tiles.map((tile) => (
                <div
                  key={tile.id}
                  className={`rounded-lg border-l-4 p-4 shadow ${getPriorityColor(tile.priority)}`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <h3 className="text-xs font-semibold uppercase tracking-wider mb-1">
                        {tile.tile_type.replace(/_/g, ' ')}
                      </h3>
                      {renderTileContent(tile)}
                    </div>
                  </div>
                  <div className="flex justify-between items-center mt-3 pt-3 border-t border-current border-opacity-20">
                    <span className="text-xs opacity-70">Source: {tile.source}</span>
                    {!tile.acknowledged && (
                      <button
                        onClick={() => acknowledgeTile(tile.id)}
                        className="text-xs px-2 py-1 rounded bg-white bg-opacity-30 hover:bg-opacity-50 transition"
                      >
                        Acknowledge
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Widgets Grid */}
        {widgets.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-3 text-gray-800">Dashboard Widgets</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {widgets.map((widget) => (
                <div key={widget.id}>{renderWidget(widget)}</div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {tiles.length === 0 && widgets.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">No alerts or widgets configured</p>
            <p className="text-gray-400 text-sm mt-2">Add widgets to customize your dashboard</p>
          </div>
        )}
      </div>
    </div>
  );
}
