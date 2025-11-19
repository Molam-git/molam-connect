import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface TimeSeriesChartProps {
  token: string;
  filter: any;
}

export default function TimeSeriesChart({ token, filter }: TimeSeriesChartProps) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          ...filter,
          granularity: 'hour'
        });

        const response = await fetch(`/api/analytics/timeseries?${params}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!response.ok) {
          throw new Error('Failed to fetch timeseries data');
        }

        const result = await response.json();
        setData(result.map((row: any) => ({
          time: new Date(row.bucket_ts).toLocaleString('fr-FR', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit'
          }),
          gmv: parseFloat(row.gmv),
          transactions: parseInt(row.tx_count)
        })));
      } catch (error) {
        console.error('Error fetching timeseries:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [token, filter]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse h-64 bg-gray-200 rounded"></div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold mb-4">GMV & Transactions Over Time</h2>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="time" />
          <YAxis yAxisId="left" />
          <YAxis yAxisId="right" orientation="right" />
          <Tooltip />
          <Legend />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="gmv"
            stroke="#3b82f6"
            strokeWidth={2}
            name="GMV"
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="transactions"
            stroke="#10b981"
            strokeWidth={2}
            name="Transactions"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
