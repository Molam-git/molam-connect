import { useState, useEffect } from 'react';
import ExperimentsList from './components/ExperimentsList';
import CreateExperiment from './components/CreateExperiment';
import ExperimentDetails from './components/ExperimentDetails';

function App() {
  const [token, setToken] = useState<string>('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [selectedExperiment, setSelectedExperiment] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    const storedToken = localStorage.getItem('molam_token');
    if (storedToken) {
      setToken(storedToken);
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogin = (newToken: string) => {
    localStorage.setItem('molam_token', newToken);
    setToken(newToken);
    setIsAuthenticated(true);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-md w-full max-w-md">
          <h1 className="text-2xl font-bold mb-4">Experiments Platform</h1>
          <p className="text-gray-600 mb-4">Please authenticate with Molam ID</p>
          <input
            type="text"
            placeholder="Paste JWT token"
            className="w-full px-4 py-2 border rounded-lg mb-4"
            onChange={(e) => handleLogin(e.target.value)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-full w-10 h-10 bg-primary-500 flex items-center justify-center text-white font-bold">
                M
              </div>
              <div>
                <h1 className="text-xl font-bold">A/B Experiments</h1>
                <p className="text-sm text-gray-500">Powered by SIRA</p>
              </div>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 bg-primary-500 text-white rounded-2xl hover:bg-primary-600 transition"
            >
              + New Experiment
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {showCreate ? (
          <CreateExperiment
            token={token}
            onClose={() => setShowCreate(false)}
            onCreate={() => {
              setShowCreate(false);
              window.location.reload();
            }}
          />
        ) : selectedExperiment ? (
          <ExperimentDetails
            experimentId={selectedExperiment}
            token={token}
            onBack={() => setSelectedExperiment(null)}
          />
        ) : (
          <ExperimentsList
            token={token}
            onSelect={setSelectedExperiment}
          />
        )}
      </div>
    </div>
  );
}

export default App;
