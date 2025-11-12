import React, { useState, useEffect } from 'react';
import BenchmarkCard from './BenchmarkCard';
import RecommendationCard from './RecommendationCard';

interface Widget {
  type: 'recommendation' | 'insight' | 'ml_recommendation';
  priority: 'low' | 'medium' | 'high';
  title: string;
  text: string;
  action?: {
    label: string;
    link: string;
  };
}

interface SiraWidgetsProps {
  merchantId?: string;
}

const SiraWidgets: React.FC<SiraWidgetsProps> = ({ merchantId }) => {
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBenchmark, setShowBenchmark] = useState(true);

  useEffect(() => {
    loadWidgets();
  }, [merchantId]);

  const loadWidgets = async () => {
    try {
      setLoading(true);

      const params = merchantId ? `?merchantId=${merchantId}` : '';
      const res = await fetch(`/api/sira/widgets${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });

      if (!res.ok) {
        throw new Error(`Failed to load widgets: ${res.status}`);
      }

      const data = await res.json();
      setWidgets(data.widgets || []);
    } catch (error) {
      console.error('Error loading SIRA widgets:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'border-red-200 bg-red-50';
      case 'medium':
        return 'border-yellow-200 bg-yellow-50';
      case 'low':
        return 'border-blue-200 bg-blue-50';
      default:
        return 'border-gray-200 bg-gray-50';
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'high':
        return '⚠️';
      case 'medium':
        return '⚡';
      case 'low':
        return '💡';
      default:
        return 'ℹ️';
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex justify-center items-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Benchmark Card */}
      {showBenchmark && merchantId && (
        <BenchmarkCard merchantId={merchantId} onClose={() => setShowBenchmark(false)} />
      )}

      {/* Dynamic Widgets */}
      {widgets.length === 0 ? (
        <div className="p-6 bg-white border border-gray-200 rounded-lg text-center text-gray-500">
          <p className="text-lg font-medium mb-2">All Clear!</p>
          <p className="text-sm">SIRA has no recommendations at this time.</p>
        </div>
      ) : (
        <>
          {widgets.map((widget, index) => (
            <div
              key={index}
              className={`p-4 border-2 rounded-lg ${getPriorityColor(widget.priority)}`}
            >
              <div className="flex items-start gap-3">
                <div className="text-2xl">{getPriorityIcon(widget.priority)}</div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-gray-900">{widget.title}</h3>
                    <span className="text-xs uppercase font-medium text-gray-500">{widget.priority}</span>
                  </div>
                  <p className="text-sm text-gray-700 mb-3">{widget.text}</p>
                  {widget.action && (
                    <a
                      href={widget.action.link}
                      className="inline-block px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition"
                    >
                      {widget.action.label}
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
};

export default SiraWidgets;
