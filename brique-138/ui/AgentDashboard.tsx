import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type AgentMetric = {
  balance?: number;
  currency?: string;
  last_update?: string;
};

type Sale = {
  id: string;
  amount: number;
  currency: string;
  sale_date: string;
  region?: string;
};

type Commission = {
  id: string;
  commission_amount: number;
  commission_rate: number;
  currency: string;
  source: string;
  created_at: string;
};

type InsightResponse = {
  float: {
    snapshot: AgentMetric | null;
    recommendations: string[];
  };
  commissions: {
    alerts: string[];
  };
  sira: {
    score: number;
    level: string;
  };
};

interface AgentDashboardProps {
  agentId: string;
  token?: string;
}

const fetchJSON = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url, {
    headers: {
      "x-role": "Agent",
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
};

export function AgentDashboard({ agentId }: AgentDashboardProps) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [floatBalance, setFloatBalance] = useState<AgentMetric | null>(null);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [insights, setInsights] = useState<InsightResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);

    Promise.all([
      fetchJSON<{ sales: Sale[] }>(`/api/v1/agents/${agentId}/sales`),
      fetchJSON<AgentMetric>(`/api/v1/agents/${agentId}/float`),
      fetchJSON<{ commissions: Commission[] }>(`/api/v1/agents/${agentId}/commissions`),
      fetchJSON<InsightResponse>(`/api/v1/agents/${agentId}/insights`),
    ])
      .then(([salesRes, floatRes, commissionsRes, insightsRes]) => {
        setSales(salesRes.sales ?? salesRes ?? []);
        setFloatBalance(floatRes);
        setCommissions(commissionsRes.commissions ?? commissionsRes ?? []);
        setInsights(insightsRes);
      })
      .finally(() => setLoading(false));
  }, [agentId]);

  const totalSales = useMemo(
    () => sales.reduce((sum, sale) => sum + sale.amount, 0).toFixed(2),
    [sales]
  );

  const totalCommissions = useMemo(
    () => commissions.reduce((sum, commission) => sum + commission.commission_amount, 0).toFixed(2),
    [commissions]
  );

  if (loading) {
    return (
      <div className="p-6 text-sm text-slate-500">
        Chargement du tableau de bord agent...
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 p-6 lg:grid-cols-3">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs uppercase text-slate-500">Float disponible</p>
        <p className="mt-2 text-3xl font-semibold text-slate-900">
          {floatBalance?.balance?.toLocaleString("fr-FR", {
            maximumFractionDigits: 0,
          })}{" "}
          {floatBalance?.currency}
        </p>
        <p className="text-xs text-slate-500">
          MAJ {floatBalance?.last_update ? new Date(floatBalance.last_update).toLocaleString() : "—"}
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs uppercase text-slate-500">Ventes (fenêtre)</p>
        <p className="mt-2 text-3xl font-semibold text-slate-900">
          {totalSales} {sales[0]?.currency ?? ""}
        </p>
        <p className="text-xs text-slate-500">{sales.length} transactions</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs uppercase text-slate-500">Commissions</p>
        <p className="mt-2 text-3xl font-semibold text-emerald-600">
          {totalCommissions} {commissions[0]?.currency ?? ""}
        </p>
        <p className="text-xs text-slate-500">{commissions.length} lignes</p>
      </div>

      {insights && (
        <div className="col-span-1 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-indigo-900 lg:col-span-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Insights SIRA</h3>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-indigo-500">
              Score {insights.sira.score} ({insights.sira.level})
            </span>
          </div>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
            {insights.float.recommendations.map((rec) => (
              <li key={rec}>{rec}</li>
            ))}
            {insights.commissions.alerts.map((alert) => (
              <li key={alert} className="text-amber-600">
                ⚠️ {alert}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="col-span-1 rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Ventes récentes</h3>
        </div>
        <div className="mt-3 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sales}>
              <XAxis dataKey="sale_date" tickFormatter={(value) => new Date(value).toLocaleDateString()} />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="amount" stroke="#4f46e5" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="col-span-1 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Commissions</h3>
        </div>
        <div className="mt-3 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={commissions}>
              <XAxis dataKey="created_at" tickFormatter={(value) => new Date(value).toLocaleDateString()} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="commission_amount" fill="#22c55e" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

