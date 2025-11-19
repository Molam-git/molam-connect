interface KPICardProps {
  title: string;
  value: string;
  trend?: string;
  trendUp?: boolean;
}

export default function KPICard({ title, value, trend, trendUp }: KPICardProps) {
  return (
    <div className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition">
      <h3 className="text-sm font-medium text-gray-500 mb-2">{title}</h3>
      <div className="flex items-baseline justify-between">
        <p className="text-2xl font-semibold text-gray-900">{value}</p>
        {trend && (
          <span
            className={`text-sm font-medium ${
              trendUp ? 'text-green-600' : 'text-red-600'
            }`}
          >
            {trend}
          </span>
        )}
      </div>
    </div>
  );
}
