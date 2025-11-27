import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import OfflinePayments from './pages/OfflinePayments';

function App() {
  return (
    <Router basename="/offline">
      <Routes>
        <Route path="/" element={<OfflinePayments />} />
      </Routes>
    </Router>
  );
}

export default App;