import { useState, useEffect } from 'react';
import AnalyticsDashboard from './components/AnalyticsDashboard';

function App() {
  const [token, setToken] = useState<string>('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // In production, get token from Molam ID auth flow
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md w-96">
          <h1 className="text-2xl font-bold mb-4">Analytics Dashboard</h1>
          <p className="text-gray-600 mb-4">Please authenticate with Molam ID</p>
          <input
            type="text"
            placeholder="Paste JWT token"
            className="w-full px-4 py-2 border rounded mb-4"
            onChange={(e) => handleLogin(e.target.value)}
          />
        </div>
      </div>
    );
  }

  return <AnalyticsDashboard token={token} />;
}

export default App;
