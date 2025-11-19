import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface CountryBreakdownProps {
  token: string;
  filter: any;
}

export default function CountryBreakdown({ token, filter }: CountryBreakdownProps) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams(filter);

        const response = await fetch(`/api/analytics/by-country?${params}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!response.ok) {
          throw new Error('Failed to fetch country breakdown');
        }

        const result = await response.json();
        setData(result.map((row: any) => ({
          country: row.country || 'Unknown',
          gmv: parseFloat(row.gmv),
          transactions: parseInt(row.tx_count),
          fees: parseFloat(row.fees_total)
        })).slice(0, 10)); // Top 10 countries
      } catch (error) {
        console.error('Error fetching country breakdown:', error);
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
      <h2 className="text-lg font-semibold mb-4">Top Countries by GMV</h2>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="country" />
          <YAxis />
          <Tooltip
            formatter={(value: number) =>
              new Intl.NumberFormat('fr-FR', {
                style: 'currency',
                currency: filter.currency || 'XOF',
                minimumFractionDigits: 0
              }).format(value)
            }
          />
          <Legend />
          <Bar dataKey="gmv" fill="#3b82f6" name="GMV" />
          <Bar dataKey="fees" fill="#10b981" name="Fees" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
