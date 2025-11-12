import axios from 'axios';

const api = axios.create({
  baseURL: '/api/marketing',
  timeout: 30000,
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Campaigns
export async function fetchCampaigns(params?: any) {
  const response = await api.get('/campaigns', { params });
  return response.data;
}

export async function createCampaign(data: any) {
  const response = await api.post('/campaigns', data);
  return response.data;
}

export async function updateCampaign(id: string, data: any) {
  const response = await api.patch(`/campaigns/${id}`, data);
  return response.data;
}

export async function fetchCampaignStats(id: string) {
  const response = await api.get(`/campaigns/${id}/stats`);
  return response.data;
}

// Promo Codes
export async function fetchPromoCodes(params?: any) {
  const response = await api.get('/promo-codes', { params });
  return response.data;
}

export async function createPromoCode(data: any) {
  const response = await api.post('/promo-codes', data);
  return response.data;
}

export async function updatePromoCode(id: string, data: any) {
  const response = await api.patch(`/promo-codes/${id}`, data);
  return response.data;
}

export async function fetchPromoCodeUsage(id: string, params?: any) {
  const response = await api.get(`/promo-codes/${id}/usage`, { params });
  return response.data;
}

export async function validatePromoCode(code: string, customerId?: string) {
  const response = await api.post('/promo-codes/validate', { code, customer_id: customerId });
  return response.data;
}

export async function refundPromoCodeUsage(usageId: string) {
  const response = await api.post(`/promo-codes/refund/${usageId}`);
  return response.data;
}

// Subscription Plans
export async function fetchSubscriptionPlans(params?: any) {
  const response = await api.get('/subscription-plans', { params });
  return response.data;
}

export async function createSubscriptionPlan(data: any) {
  const response = await api.post('/subscription-plans', data);
  return response.data;
}

export async function updateSubscriptionPlan(id: string, data: any) {
  const response = await api.patch(`/subscription-plans/${id}`, data);
  return response.data;
}

export async function fetchPlanStats(id: string) {
  const response = await api.get(`/subscription-plans/${id}/stats`);
  return response.data;
}

export async function deactivateSubscriptionPlan(id: string) {
  const response = await api.delete(`/subscription-plans/${id}`);
  return response.data;
}

// Subscriptions
export async function fetchSubscriptions(params?: any) {
  const response = await api.get('/subscriptions', { params });
  return response.data;
}

export async function createSubscription(data: any) {
  const response = await api.post('/subscriptions', data);
  return response.data;
}

export async function cancelSubscription(id: string, data: any) {
  const response = await api.post(`/subscriptions/${id}/cancel`, data);
  return response.data;
}

export async function reactivateSubscription(id: string) {
  const response = await api.post(`/subscriptions/${id}/reactivate`);
  return response.data;
}

export async function fetchSubscriptionInvoices(id: string, params?: any) {
  const response = await api.get(`/subscriptions/${id}/invoices`, { params });
  return response.data;
}

export default api;
