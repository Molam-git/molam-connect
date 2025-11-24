/**
 * Molam Platform - Application Principale
 * Router et layout principal pour toutes les briques
 */
import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import LoginPage from './pages/LoginPage';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import './App.css';

// Import des modules (seront ajoutés progressivement)
// import WalletModule from './modules/wallet';
// import DashboardModule from './modules/dashboard';
// import AnalyticsModule from './modules/analytics';

function AppRoutes() {
  const { isAuthenticated, user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading Molam Platform...</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />

      {/* Protected routes */}
      {isAuthenticated ? (
        <Route path="/*" element={<Layout />}>
          <Route index element={<Landing />} />

          {/* Wallet routes (Customer) */}
          <Route
            path="wallet/*"
            element={
              <div className="p-8">
                <h1 className="text-2xl font-bold">Molam Ma (Wallet)</h1>
                <p className="text-gray-600 mt-2">Module Wallet sera chargé ici</p>
              </div>
            }
          />

          {/* Dashboard routes (Merchant) */}
          <Route
            path="dashboard/*"
            element={
              <div className="p-8">
                <h1 className="text-2xl font-bold">Molam Connect (Dashboard)</h1>
                <p className="text-gray-600 mt-2">Module Dashboard sera chargé ici</p>
              </div>
            }
          />

          {/* Analytics routes */}
          <Route
            path="analytics/*"
            element={
              <div className="p-8">
                <h1 className="text-2xl font-bold">Analytics</h1>
                <p className="text-gray-600 mt-2">Module Analytics sera chargé ici</p>
              </div>
            }
          />

          {/* Experiments routes */}
          <Route
            path="experiments/*"
            element={
              <div className="p-8">
                <h1 className="text-2xl font-bold">A/B Experiments</h1>
                <p className="text-gray-600 mt-2">Module Experiments sera chargé ici</p>
              </div>
            }
          />

          {/* Admin routes */}
          <Route
            path="admin/*"
            element={
              <div className="p-8">
                <h1 className="text-2xl font-bold">Admin Panel</h1>
                <p className="text-gray-600 mt-2">Module Admin sera chargé ici</p>
              </div>
            }
          />

          {/* 404 */}
          <Route
            path="*"
            element={
              <div className="p-8 text-center">
                <h1 className="text-4xl font-bold text-gray-800">404</h1>
                <p className="text-gray-600 mt-2">Page non trouvée</p>
              </div>
            }
          />
        </Route>
      ) : (
        <Route path="*" element={<Navigate to="/login" replace />} />
      )}
    </Routes>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </Router>
  );
}

export default App;
