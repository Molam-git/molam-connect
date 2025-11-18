/**
 * Molam Form Core - Merchant Dashboard
 * React UI for managing API keys, viewing logs, and configuring checkout
 */

import React, { useState } from 'react';
import './App.css';
import APIKeysPanel from './components/APIKeysPanel';
import LogsPanel from './components/LogsPanel';
import ConfigPanel from './components/ConfigPanel';
import OverviewPanel from './components/OverviewPanel';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  merchant_id: string;
}

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('overview');

  // Mock user - in production, get from auth context
  const user: User = {
    id: 'user_123',
    name: 'John Doe',
    email: 'john@example.com',
    role: 'merchant_owner',
    merchant_id: 'merchant_abc123'
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'api-keys', label: 'API Keys', icon: '🔑' },
    { id: 'config', label: 'Configuration', icon: '⚙️' },
    { id: 'logs', label: 'Logs', icon: '📝' },
  ];

  return (
    <div className="dashboard">
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-content">
          <div className="logo">
            <span className="logo-icon">💳</span>
            <h1>Molam Dashboard</h1>
          </div>
          <div className="user-info">
            <span className="user-name">{user.name}</span>
            <span className="user-email">{user.email}</span>
            <span className="user-role">{user.role}</span>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="dashboard-nav">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`nav-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Main Content */}
      <main className="dashboard-main">
        {activeTab === 'overview' && <OverviewPanel merchantId={user.merchant_id} />}
        {activeTab === 'api-keys' && <APIKeysPanel merchantId={user.merchant_id} userId={user.id} />}
        {activeTab === 'config' && <ConfigPanel merchantId={user.merchant_id} />}
        {activeTab === 'logs' && <LogsPanel merchantId={user.merchant_id} />}
      </main>

      {/* Footer */}
      <footer className="dashboard-footer">
        <p>Molam Form Core v1.0.0 | <a href="https://docs.molam.com" target="_blank" rel="noopener noreferrer">Documentation</a> | <a href="https://molam.com/support" target="_blank" rel="noopener noreferrer">Support</a></p>
      </footer>
    </div>
  );
};

export default App;
