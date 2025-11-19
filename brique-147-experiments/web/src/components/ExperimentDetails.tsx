import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface Props {
  experimentId: string;
  token: string;
  onBack: () => void;
}

export default function ExperimentDetails({ experimentId, token, onBack }: Props) {
  const [experiment, setExperiment] = useState<any>(null);
  const [results, setResults] = useState<any[]>([]);
  const [insights, setInsights] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [experimentId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [expRes, resultsRes, insightsRes] = await Promise.all([
        fetch(`/api/experiments/${experimentId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`/api/experiments/${experimentId}/results`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`/api/experiments/${experimentId}/insights`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      const expData = await expRes.json();
      const resultsData = await resultsRes.json();
      const insightsData = await insightsRes.json();

      setExperiment(expData);
      setResults(resultsData);
      setInsights(insightsData);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStart = async () => {
    if (!confirm('Start this experiment?')) return;

    try {
      await fetch(`/api/experiments/${experimentId}/start`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchData();
    } catch (error) {
      console.error('Error starting experiment:', error);
    }
  };

  const handleStop = async () => {
    if (!confirm('Stop this experiment?')) return;

    try {
      await fetch(`/api/experiments/${experimentId}/stop`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchData();
    } catch (error) {
      console.error('Error stopping experiment:', error);
    }
  };

  if (loading || !experiment) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  const chartData = results.map(r => ({
    name: r.name,
    'Conversion Rate': (r.conversion_rate * 100).toFixed(2),
    'Assignments': r.assignments,
    'Conversions': r.conversions
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <button
          onClick={onBack}
          className="text-primary-500 hover:text-primary-600 mb-4"
        >
          ← Back to experiments
        </button>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-2">{experiment.name}</h1>
            <p className="text-gray-600">{experiment.description}</p>
          </div>

          <div className="flex gap-2">
            {experiment.status === 'draft' && (
              <button
                onClick={handleStart}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
              >
                Start
              </button>
            )}
            {experiment.status === 'running' && (
              <button
                onClick={handleStop}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
              >
                Stop
              </button>
            )}
            <span className={`px-3 py-2 rounded-lg text-sm font-medium ${
              experiment.status === 'running' ? 'bg-green-100 text-green-800' :
              experiment.status === 'stopped' ? 'bg-red-100 text-red-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {experiment.status}
            </span>
          </div>
        </div>
      </div>

      {/* SIRA Insights */}
      {insights && insights.recommendation && (
        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-lg">
          <div className="flex">
            <div className="flex-shrink-0">
              <span className="text-2xl">🤖</span>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-blue-800">SIRA Insights</p>
              <p className="text-sm text-blue-700 mt-1">{insights.recommendation}</p>
            </div>
          </div>
        </div>
      )}

      {/* Results Chart */}
      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">Conversion Rate by Variant</h2>
        {results.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="Conversion Rate" fill="#0A84FF" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-500 text-center py-8">No results yet</p>
        )}
      </div>

      {/* Variants Table */}
      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">Variant Performance</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Variant</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Assignments</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Conversions</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rate</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Avg Value</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Refunds</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Churns</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {results.map((result) => (
                <tr key={result.id} className={result.is_control ? 'bg-blue-50' : ''}>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex items-center">
                      {result.name}
                      {result.is_control && (
                        <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded">
                          Control
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm">{result.assignments || 0}</td>
                  <td className="px-4 py-3 text-sm">{result.conversions || 0}</td>
                  <td className="px-4 py-3 text-sm font-medium">
                    {(result.conversion_rate * 100).toFixed(2)}%
                  </td>
                  <td className="px-4 py-3 text-sm">
                    ${result.average_value?.toFixed(2) || '0.00'}
                  </td>
                  <td className="px-4 py-3 text-sm">{result.refunds || 0}</td>
                  <td className="px-4 py-3 text-sm">{result.churns || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SIRA Statistical Insights */}
      {insights && insights.insights && insights.insights.length > 0 && (
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">Statistical Analysis (Thompson Sampling)</h2>
          <div className="space-y-3">
            {insights.insights.map((insight: any, idx: number) => (
              <div key={idx} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{insight.variant}</span>
                  <span className="text-sm text-gray-500">{insight.samples} samples</span>
                </div>
                <div className="flex items-center gap-4">
                  <div>
                    <span className="text-xs text-gray-500">Conversion Rate</span>
                    <p className="text-lg font-semibold">{(insight.conversion_rate * 100).toFixed(2)}%</p>
                  </div>
                  <div className="flex-1">
                    <span className="text-xs text-gray-500">95% Confidence Interval</span>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="flex-1 bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-primary-500 h-2 rounded-full"
                          style={{
                            width: `${(insight.confidence_interval.upper - insight.confidence_interval.lower) * 100}%`,
                            marginLeft: `${insight.confidence_interval.lower * 100}%`
                          }}
                        />
                      </div>
                      <span className="text-xs text-gray-600">
                        [{(insight.confidence_interval.lower * 100).toFixed(1)}% - {(insight.confidence_interval.upper * 100).toFixed(1)}%]
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
