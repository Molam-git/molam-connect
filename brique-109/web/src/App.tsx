import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import CheckoutDemo from './pages/CheckoutDemo';

function App() {
  return (
    <Router basename="/checkout">
      <Routes>
        <Route path="/" element={<CheckoutDemo />} />
      </Routes>
    </Router>
  );
}

export default App;