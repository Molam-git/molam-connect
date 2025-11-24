import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import BankProfile from './pages/BankProfile';
import TreasuryDashboard from './pages/TreasuryDashboard';
import PayoutWorkbench from './pages/PayoutWorkbench';

function App() {
    return (
        <Router>
            <Routes>
                <Route path="/" element={<TreasuryDashboard />} />
                <Route path="/bank-profiles" element={<BankProfile />} />
                <Route path="/payouts" element={<PayoutWorkbench />} />
            </Routes>
        </Router>
    );
}

export default App;