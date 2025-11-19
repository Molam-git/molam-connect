import { useState, useEffect } from 'react';

interface Experiment {
  id: string;
  name: string;
  description: string;
  status: string;
  assignments_count: number;
  created_at: string;
}

interface Props {
  token: string;
  onSelect: (id: string) => void;
}

export default function ExperimentsList({ token, onSelect }: Props) {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    fetchExperiments();
  }, [filter]);

  const fetchExperiments = async () => {
    setLoading(true);
    try {
      const url = filter === 'all'
        ? '/api/experiments'
        : `/api/experiments?status=${filter}`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) throw new Error('Failed to fetch experiments');

      const data = await response.json();
      setExperiments(data);
    } catch (error) {
      console.error('Error fetching experiments:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'bg-green-100 text-green-800';
      case 'stopped': return 'bg-red-100 text-red-800';
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'archived': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div>
      {/* Filters */}
      <div className="mb-6 flex gap-2">
        {['all', 'draft', 'running', 'stopped', 'archived'].map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              filter === status
                ? 'bg-primary-500 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      {/* Experiments Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {experiments.map((exp) => (
          <div
            key={exp.id}
            onClick={() => onSelect(exp.id)}
            className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition cursor-pointer"
          >
            <div className="flex items-start justify-between mb-3">
              <h3 className="text-lg font-semibold">{exp.name}</h3>
              <span className={`px-2 py-1 rounded-lg text-xs font-medium ${getStatusColor(exp.status)}`}>
                {exp.status}
              </span>
            </div>

            <p className="text-sm text-gray-600 mb-4 line-clamp-2">
              {exp.description || 'No description'}
            </p>

            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>{exp.assignments_count || 0} assignments</span>
              <span>{new Date(exp.created_at).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
      </div>

      {experiments.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">No experiments found</p>
        </div>
      )}
    </div>
  );
}
