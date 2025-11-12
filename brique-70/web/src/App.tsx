import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import PromoCodes from './pages/PromoCodes';
import Campaigns from './pages/Campaigns';
import SubscriptionPlans from './pages/SubscriptionPlans';
import Subscriptions from './pages/Subscriptions';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/campaigns" element={<Campaigns />} />
          <Route path="/promo-codes" element={<PromoCodes />} />
          <Route path="/subscription-plans" element={<SubscriptionPlans />} />
          <Route path="/subscriptions" element={<Subscriptions />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
