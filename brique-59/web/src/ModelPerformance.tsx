import React, { useState, useEffect } from 'react';

interface Model {
  id: string;
  model_type: string;
  version: string;
  status: string;
  accuracy: number;
  training_samples: number;
  hyperparameters: Record<string, any>;
  feature_importance: Record<string, number>;
  metadata: Record<string, any>;
  created_at: string;
}

interface Prediction {
  id: string;
  dispute_id: string;
  model_version: string;
  win_probability: number;
  confidence: number;
  actual_outcome: string | null;
  prediction_correct: boolean | null;
  created_at: string;
}

interface Patch {
  id: string;
  patch_name: string;
  model_version: string;
  patch_type: string;
  status: string;
  tests_passed: boolean;
  accuracy_improvement: number;
  created_at: string;
}

const ModelPerformance: React.FC = () => {
  const [models, setModels] = useState<Model[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [patches, setPatches] = useState<Patch[]>([]);
  const [selectedTab, setSelectedTab] = useState<'models' | 'predictions' | 'patches'>('models');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [selectedTab]);

  const loadData = async () => {
    try {
      setLoading(true);

      if (selectedTab === 'models') {
        const res = await fetch('/api/sira/models', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        });
        if (res.ok) setModels(await res.json());
      } else if (selectedTab === 'predictions') {
        const res = await fetch('/api/sira/predictions?has_outcome=true&limit=50', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        });
        if (res.ok) setPredictions(await res.json());
      } else if (selectedTab === 'patches') {
        const res = await fetch('/api/sira/patches', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        });
        if (res.ok) setPatches(await res.json());
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const activateModel = async (id: string) => {
    if (!confirm('Activate this model? The current active model will be archived.')) return;

    try {
      const res = await fetch(`/api/sira/models/${id}/activate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (res.ok) {
        alert('Model activated successfully');
        loadData();
      }
    } catch (error) {
      alert('Failed to activate model');
    }
  };

  const testPatch = async (id: string) => {
    if (!confirm('Test this patch in sandbox? This may take several minutes.')) return;

    try {
      const res = await fetch(`/api/sira/patches/${id}/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (res.ok) {
        const result = await res.json();
        alert(`Patch test completed:\nTests Passed: ${result.passed}\nImprovement: ${(result.improvement * 100).toFixed(2)}%`);
        loadData();
      }
    } catch (error) {
      alert('Patch test failed. Check logs for details.');
    }
  };

  const deployPatch = async (id: string) => {
    if (!confirm('Deploy this patch to production? This action cannot be undone.')) return;

    try {
      const res = await fetch(`/api/sira/patches/${id}/deploy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (res.ok) {
        alert('Patch deployed successfully');
        loadData();
      }
    } catch (error) {
      alert('Patch deployment failed');
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      active: 'bg-green-100 text-green-800',
      testing: 'bg-yellow-100 text-yellow-800',
      archived: 'bg-gray-100 text-gray-800',
      pending: 'bg-blue-100 text-blue-800',
      approved: 'bg-green-100 text-green-800',
      deployed: 'bg-purple-100 text-purple-800',
      rejected: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <div className="p-6 flex justify-center items-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">SIRA Model Performance</h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b">
        <button
          onClick={() => setSelectedTab('models')}
          className={`px-4 py-2 font-medium ${
            selectedTab === 'models' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'
          }`}
        >
          Models ({models.length})
        </button>
        <button
          onClick={() => setSelectedTab('predictions')}
          className={`px-4 py-2 font-medium ${
            selectedTab === 'predictions' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'
          }`}
        >
          Predictions ({predictions.length})
        </button>
        <button
          onClick={() => setSelectedTab('patches')}
          className={`px-4 py-2 font-medium ${
            selectedTab === 'patches' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'
          }`}
        >
          Patches ({patches.length})
        </button>
      </div>

      {/* Models Tab */}
      {selectedTab === 'models' && (
        <div className="space-y-4">
          {models.map((model) => (
            <div key={model.id} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold">{model.version}</h3>
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${getStatusBadge(model.status)}`}>
                    {model.status}
                  </span>
                </div>
                {model.status !== 'active' && (
                  <button
                    onClick={() => activateModel(model.id)}
                    className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                  >
                    Activate
                  </button>
                )}
              </div>

              <div className="grid grid-cols-4 gap-4 mb-3">
                <div>
                  <div className="text-sm text-gray-600">Accuracy</div>
                  <div className="text-2xl font-bold text-gray-900">{(model.accuracy * 100).toFixed(1)}%</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Training Samples</div>
                  <div className="text-2xl font-bold text-gray-900">{model.training_samples.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Model Type</div>
                  <div className="text-sm font-medium text-gray-900">{model.model_type}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Created</div>
                  <div className="text-sm font-medium text-gray-900">
                    {new Date(model.created_at).toLocaleDateString()}
                  </div>
                </div>
              </div>

              {Object.keys(model.feature_importance || {}).length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-blue-600 font-medium">Feature Importance</summary>
                  <div className="mt-2 space-y-1">
                    {Object.entries(model.feature_importance)
                      .sort(([, a], [, b]) => (b as number) - (a as number))
                      .slice(0, 5)
                      .map(([feature, importance]) => (
                        <div key={feature} className="flex items-center justify-between">
                          <span className="text-gray-700">{feature}</span>
                          <div className="flex items-center gap-2">
                            <div className="w-32 bg-gray-200 rounded-full h-2">
                              <div
                                className="bg-blue-600 h-2 rounded-full"
                                style={{ width: `${(importance as number) * 100}%` }}
                              ></div>
                            </div>
                            <span className="text-gray-600 w-12 text-right">{((importance as number) * 100).toFixed(0)}%</span>
                          </div>
                        </div>
                      ))}
                  </div>
                </details>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Predictions Tab */}
      {selectedTab === 'predictions' && (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border border-gray-200">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-2 text-left text-sm font-semibold">Dispute ID</th>
                <th className="px-4 py-2 text-left text-sm font-semibold">Model</th>
                <th className="px-4 py-2 text-left text-sm font-semibold">Win Probability</th>
                <th className="px-4 py-2 text-left text-sm font-semibold">Confidence</th>
                <th className="px-4 py-2 text-left text-sm font-semibold">Actual</th>
                <th className="px-4 py-2 text-left text-sm font-semibold">Correct?</th>
                <th className="px-4 py-2 text-left text-sm font-semibold">Date</th>
              </tr>
            </thead>
            <tbody>
              {predictions.map((pred) => (
                <tr key={pred.id} className="border-t border-gray-200">
                  <td className="px-4 py-2 text-sm font-mono">{pred.dispute_id.substring(0, 8)}...</td>
                  <td className="px-4 py-2 text-sm">{pred.model_version}</td>
                  <td className="px-4 py-2 text-sm">{(pred.win_probability * 100).toFixed(0)}%</td>
                  <td className="px-4 py-2 text-sm">{(pred.confidence * 100).toFixed(0)}%</td>
                  <td className="px-4 py-2 text-sm">
                    {pred.actual_outcome ? (
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          pred.actual_outcome === 'won'
                            ? 'bg-green-100 text-green-800'
                            : pred.actual_outcome === 'lost'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {pred.actual_outcome}
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="px-4 py-2 text-sm">
                    {pred.prediction_correct !== null ? (
                      pred.prediction_correct ? (
                        <span className="text-green-600">✓</span>
                      ) : (
                        <span className="text-red-600">✗</span>
                      )
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="px-4 py-2 text-sm">{new Date(pred.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Patches Tab */}
      {selectedTab === 'patches' && (
        <div className="space-y-4">
          {patches.map((patch) => (
            <div key={patch.id} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold">{patch.patch_name}</h3>
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${getStatusBadge(patch.status)}`}>
                    {patch.status}
                  </span>
                  <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs">{patch.patch_type}</span>
                </div>
                <div className="flex gap-2">
                  {patch.status === 'pending' && (
                    <button
                      onClick={() => testPatch(patch.id)}
                      className="px-4 py-2 bg-yellow-600 text-white text-sm rounded hover:bg-yellow-700"
                    >
                      Test
                    </button>
                  )}
                  {patch.status === 'testing' && patch.tests_passed && (
                    <button
                      onClick={() => deployPatch(patch.id)}
                      className="px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                    >
                      Deploy
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div>
                  <div className="text-sm text-gray-600">Model Version</div>
                  <div className="text-sm font-medium text-gray-900">{patch.model_version}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Tests Passed</div>
                  <div className="text-sm font-medium text-gray-900">{patch.tests_passed ? '✓ Yes' : '✗ No'}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Accuracy Improvement</div>
                  <div
                    className={`text-sm font-medium ${
                      patch.accuracy_improvement > 0 ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {patch.accuracy_improvement > 0 ? '+' : ''}
                    {(patch.accuracy_improvement * 100).toFixed(2)}%
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">Created</div>
                  <div className="text-sm font-medium text-gray-900">
                    {new Date(patch.created_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ModelPerformance;
