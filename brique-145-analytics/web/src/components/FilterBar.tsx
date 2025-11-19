interface FilterBarProps {
  filter: {
    from?: string;
    to?: string;
    zone?: string;
    country?: string;
    city?: string;
    currency?: string;
  };
  onFilterChange: (filter: any) => void;
}

export default function FilterBar({ filter, onFilterChange }: FilterBarProps) {
  const zones = ['CEDEAO', 'CEMAC', 'EU', 'US', 'ASEAN', 'GLOBAL'];
  const currencies = ['XOF', 'XAF', 'EUR', 'USD', 'GBP'];

  const handleChange = (key: string, value: string) => {
    onFilterChange({ ...filter, [key]: value || undefined });
  };

  return (
    <div className="bg-white rounded-lg shadow p-6 mb-8">
      <h2 className="text-lg font-semibold mb-4">Filters</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
          <input
            type="datetime-local"
            value={filter.from?.slice(0, 16) || ''}
            onChange={(e) => handleChange('from', e.target.value ? new Date(e.target.value).toISOString() : '')}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
          <input
            type="datetime-local"
            value={filter.to?.slice(0, 16) || ''}
            onChange={(e) => handleChange('to', e.target.value ? new Date(e.target.value).toISOString() : '')}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Zone</label>
          <select
            value={filter.zone || ''}
            onChange={(e) => handleChange('zone', e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          >
            <option value="">All zones</option>
            {zones.map(zone => (
              <option key={zone} value={zone}>{zone}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
          <input
            type="text"
            placeholder="e.g. SN, FR"
            value={filter.country || ''}
            onChange={(e) => handleChange('country', e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
          <input
            type="text"
            placeholder="e.g. Dakar"
            value={filter.city || ''}
            onChange={(e) => handleChange('city', e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
          <select
            value={filter.currency || ''}
            onChange={(e) => handleChange('currency', e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          >
            <option value="">All currencies</option>
            {currencies.map(curr => (
              <option key={curr} value={curr}>{curr}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
