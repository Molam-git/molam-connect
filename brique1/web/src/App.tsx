import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import MultiCurrencyWallets from './pages/MultiCurrencyWallets';

function App() {
  return (
    <Router basename="/multi-currency-wallets">
      <Routes>
        <Route path="/" element={<MultiCurrencyWallets />} />
      </Routes>
    </Router>
  );
}

export default App;
