import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import MerchantDashboard from './pages/MerchantDashboard';

function App() {
  return (
    <Router basename="/merchant-dashboard">
      <Routes>
        <Route path="/" element={<MerchantDashboard />} />
      </Routes>
    </Router>
  );
}

export default App;