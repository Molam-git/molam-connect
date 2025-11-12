/**
 * API Client for Analytics Dashboard
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/analytics';

// Mock auth token (in production, use proper auth)
const getAuthToken = () => {
  return localStorage.getItem('auth_token') || 'mock-token';
};

async function fetchAPI(endpoint: string, options: RequestInit = {}) {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getAuthToken()}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }

  return response.json();
}

export async function fetchKPIs(from: string, to: string, merchantId?: string) {
  const params = new URLSearchParams({ from, to });
  if (merchantId) params.append('merchantId', merchantId);

  return fetchAPI(`/kpis?${params}`);
}

export async function fetchTimeseries(
  metric: string,
  from: string,
  to: string,
  interval: 'day' | 'hour' = 'day',
  merchantId?: string
) {
  const params = new URLSearchParams({ metric, from, to, interval });
  if (merchantId) params.append('merchantId', merchantId);

  return fetchAPI(`/timeseries?${params}`);
}

export async function fetchTopMerchants(from: string, to: string, limit: number = 10) {
  const params = new URLSearchParams({ from, to, limit: limit.toString() });
  return fetchAPI(`/top/merchants?${params}`);
}

export async function fetchTopCountries(from: string, to: string, limit: number = 10, merchantId?: string) {
  const params = new URLSearchParams({ from, to, limit: limit.toString() });
  if (merchantId) params.append('merchantId', merchantId);

  return fetchAPI(`/top/countries?${params}`);
}

export async function fetchAlerts(status: string = 'open', limit: number = 50) {
  const params = new URLSearchParams({ status, limit: limit.toString() });
  return fetchAPI(`/alerts?${params}`);
}

export async function updateAlert(alertId: string, status: string, notes?: string) {
  return fetchAPI(`/alerts/${alertId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status, resolution_notes: notes }),
  });
}

export async function fetchAlertRules() {
  return fetchAPI('/alerts/rules');
}

export async function createAlertRule(rule: any) {
  return fetchAPI('/alerts/rules', {
    method: 'POST',
    body: JSON.stringify(rule),
  });
}

// Reports & Export APIs
export async function exportReport(config: any) {
  return fetchAPI('/reports/export', {
    method: 'POST',
    body: JSON.stringify(config),
  });
}

export async function fetchReportSchedules(status?: string) {
  const params = status ? `?status=${status}` : '';
  return fetchAPI(`/reports/schedules${params}`);
}

export async function createReportSchedule(schedule: any) {
  return fetchAPI('/reports/schedule', {
    method: 'POST',
    body: JSON.stringify(schedule),
  });
}

export async function updateReportSchedule(scheduleId: string, updates: any) {
  return fetchAPI(`/reports/schedules/${scheduleId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function deleteReportSchedule(scheduleId: string) {
  return fetchAPI(`/reports/schedules/${scheduleId}`, {
    method: 'DELETE',
  });
}

export async function fetchReportHistory(limit: number = 50) {
  return fetchAPI(`/reports/history?limit=${limit}`);
}

export async function fetchExportTemplates() {
  return fetchAPI('/reports/templates');
}

// Custom Views APIs
export async function fetchCustomViews() {
  return fetchAPI('/views');
}

export async function createCustomView(view: any) {
  return fetchAPI('/views', {
    method: 'POST',
    body: JSON.stringify(view),
  });
}

export async function updateCustomView(viewId: string, updates: any) {
  return fetchAPI(`/views/${viewId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function deleteCustomView(viewId: string) {
  return fetchAPI(`/views/${viewId}`, {
    method: 'DELETE',
  });
}

export async function fetchCustomView(viewId: string) {
  return fetchAPI(`/views/${viewId}`);
}
