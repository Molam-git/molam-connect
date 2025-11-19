// ============================================================================
// Merchant Dashboard - React Component (Apple-like design)
// ============================================================================

import React, { useEffect, useState } from "react";

interface KPI {
  value: number;
  currency: string;
  usd_equivalent?: number;
  txn_count?: number;
}

interface KPISummary {
  sales: KPI;
  refunds: KPI;
  fees: KPI;
  net_revenue: KPI;
  chargeback_rate?: KPI;
  avg_ticket?: KPI;
}

interface Transaction {
  id: string;
  type: string;
  amount: number;
  currency: string;
  status: string;
  reference_code: string;
  occurred_at: string;
  customer_email?: string;
  customer_name?: string;
}

interface Payout {
  id: string;
  amount: number;
  currency: string;
  status: string;
  scheduled_date: string;
  paid_at?: string;
  fee: number;
}

interface Alert {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  description: string;
  created_at: string;
}

export default function MerchantDashboard() {
  const [period, setPeriod] = useState<string>("mtd");
  const [kpi, setKpi] = useState<KPISummary | null>(null);
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  // Fetch KPIs
  useEffect(() => {
    fetch(`/api/merchant/dashboard/summary?period=${period}`)
      .then((r) => r.json())
      .then((data) => setKpi(data.summary))
      .catch((e) => console.error("Failed to load KPIs", e));
  }, [period]);

  // Fetch transactions
  useEffect(() => {
    setLoading(true);
    fetch(`/api/merchant/dashboard/transactions?page=${page}&limit=20`)
      .then((r) => r.json())
      .then((data) => {
        setTxns(data.rows || []);
        setLoading(false);
      })
      .catch((e) => {
        console.error("Failed to load transactions", e);
        setLoading(false);
      });
  }, [page]);

  // Fetch payouts
  useEffect(() => {
    fetch(`/api/merchant/dashboard/payouts?limit=10`)
      .then((r) => r.json())
      .then((data) => setPayouts(data.rows || []))
      .catch((e) => console.error("Failed to load payouts", e));
  }, []);

  // Fetch alerts
  useEffect(() => {
    fetch(`/api/merchant/dashboard/alerts`)
      .then((r) => r.json())
      .then((data) => setAlerts(data.alerts || []))
      .catch((e) => console.error("Failed to load alerts", e));
  }, []);

  const formatAmount = (amount: number, currency: string) => {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: currency || "XOF",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-xl border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-semibold text-gray-900">Dashboard</h1>
              <p className="text-sm text-gray-500 mt-1">Vue d'ensemble de votre activité</p>
            </div>
            <div className="flex items-center space-x-3">
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="px-4 py-2 rounded-xl border border-gray-300 bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="today">Aujourd'hui</option>
                <option value="yesterday">Hier</option>
                <option value="last_7d">7 derniers jours</option>
                <option value="mtd">Mois en cours</option>
                <option value="ytd">Année en cours</option>
              </select>
              <button className="px-4 py-2 rounded-xl border border-gray-300 text-sm font-medium hover:bg-gray-50 transition">
                Export CSV
              </button>
              <button className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition">
                Nouveau Remboursement
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Alerts Banner */}
        {alerts.length > 0 && (
          <div className="mb-6 space-y-2">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={`rounded-2xl p-4 ${
                  alert.severity === "critical"
                    ? "bg-red-50 border border-red-200"
                    : alert.severity === "warning"
                    ? "bg-yellow-50 border border-yellow-200"
                    : "bg-blue-50 border border-blue-200"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-sm">{alert.title}</h3>
                    <p className="text-sm text-gray-600 mt-1">{alert.description}</p>
                  </div>
                  <button className="text-gray-400 hover:text-gray-600">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* KPI Cards */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <KPICard
            title="Ventes"
            value={kpi ? formatAmount(kpi.sales.value, kpi.sales.currency) : "–"}
            subtitle={
              kpi?.sales.usd_equivalent
                ? `≈ ${formatAmount(kpi.sales.usd_equivalent, "USD")}`
                : undefined
            }
            trend="+12%"
            icon="💰"
          />
          <KPICard
            title="Remboursements"
            value={kpi ? formatAmount(kpi.refunds.value, kpi.refunds.currency) : "–"}
            subtitle={
              kpi?.refunds.txn_count ? `${kpi.refunds.txn_count} transactions` : undefined
            }
            icon="↩️"
          />
          <KPICard
            title="Frais"
            value={kpi ? formatAmount(kpi.fees.value, kpi.fees.currency) : "–"}
            icon="📊"
          />
          <KPICard
            title="Revenu Net"
            value={kpi ? formatAmount(kpi.net_revenue.value, kpi.net_revenue.currency) : "–"}
            subtitle={
              kpi?.net_revenue.usd_equivalent
                ? `≈ ${formatAmount(kpi.net_revenue.usd_equivalent, "USD")}`
                : undefined
            }
            trend="+8%"
            icon="✅"
          />
        </section>

        {/* Secondary Metrics */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <MetricCard
            title="Panier Moyen"
            value={kpi?.avg_ticket ? formatAmount(kpi.avg_ticket.value, kpi.avg_ticket.currency) : "–"}
          />
          <MetricCard
            title="Taux de Chargeback"
            value={kpi?.chargeback_rate ? `${kpi.chargeback_rate.value.toFixed(2)}%` : "0.00%"}
          />
          <MetricCard title="Taux de Conversion" value="98.5%" />
        </section>

        {/* Transactions Table */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Transactions Récentes</h2>
            <div className="flex items-center space-x-2">
              <input
                type="search"
                placeholder="Rechercher..."
                className="px-4 py-2 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button className="px-4 py-2 rounded-xl border border-gray-300 text-sm font-medium hover:bg-gray-50">
                Filtres
              </button>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12 text-gray-500">Chargement...</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left border-b border-gray-200">
                    <tr>
                      <th className="pb-3 font-semibold text-gray-600">Date</th>
                      <th className="pb-3 font-semibold text-gray-600">Type</th>
                      <th className="pb-3 font-semibold text-gray-600">Client</th>
                      <th className="pb-3 font-semibold text-gray-600">Montant</th>
                      <th className="pb-3 font-semibold text-gray-600">Statut</th>
                      <th className="pb-3 font-semibold text-gray-600"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {txns.map((t) => (
                      <tr key={t.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 text-gray-600">
                          {new Date(t.occurred_at).toLocaleString("fr-FR", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="py-3">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-medium bg-blue-100 text-blue-800">
                            {t.type}
                          </span>
                        </td>
                        <td className="py-3 text-gray-600">{t.customer_email || "–"}</td>
                        <td className="py-3 font-medium">{formatAmount(t.amount, t.currency)}</td>
                        <td className="py-3">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-medium ${
                              t.status === "succeeded"
                                ? "bg-green-100 text-green-800"
                                : t.status === "pending"
                                ? "bg-yellow-100 text-yellow-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {t.status}
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          <button className="px-3 py-1 rounded-lg border border-gray-300 text-xs font-medium hover:bg-gray-50">
                            Détails
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="mt-6 flex items-center justify-between">
                <div className="text-sm text-gray-500">Page {page}</div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-4 py-2 rounded-xl border border-gray-300 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Précédent
                  </button>
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    className="px-4 py-2 rounded-xl border border-gray-300 text-sm font-medium hover:bg-gray-50"
                  >
                    Suivant
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        {/* Payouts Section */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold mb-4">Versements</h2>
          <div className="space-y-3">
            {payouts.slice(0, 5).map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between p-4 rounded-xl border border-gray-200 hover:bg-gray-50"
              >
                <div>
                  <div className="font-medium">{formatAmount(p.amount, p.currency)}</div>
                  <div className="text-sm text-gray-500 mt-1">
                    {p.paid_at
                      ? `Payé le ${new Date(p.paid_at).toLocaleDateString("fr-FR")}`
                      : `Prévu le ${new Date(p.scheduled_date).toLocaleDateString("fr-FR")}`}
                  </div>
                </div>
                <span
                  className={`inline-flex items-center px-3 py-1 rounded-lg text-xs font-medium ${
                    p.status === "paid"
                      ? "bg-green-100 text-green-800"
                      : p.status === "pending"
                      ? "bg-yellow-100 text-yellow-800"
                      : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {p.status}
                </span>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

// KPI Card Component
function KPICard({
  title,
  value,
  subtitle,
  trend,
  icon,
}: {
  title: string;
  value: string;
  subtitle?: string;
  trend?: string;
  icon?: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm hover:shadow-md transition">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold">{title}</div>
        {icon && <div className="text-2xl">{icon}</div>}
      </div>
      <div className="text-3xl font-semibold text-gray-900 mt-2">{value}</div>
      {subtitle && <div className="text-sm text-gray-500 mt-1">{subtitle}</div>}
      {trend && (
        <div
          className={`text-xs font-medium mt-2 ${
            trend.startsWith("+") ? "text-green-600" : "text-red-600"
          }`}
        >
          {trend} vs période précédente
        </div>
      )}
    </div>
  );
}

// Metric Card Component
function MetricCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm">
      <div className="text-sm text-gray-500 mb-1">{title}</div>
      <div className="text-2xl font-semibold text-gray-900">{value}</div>
    </div>
  );
}
