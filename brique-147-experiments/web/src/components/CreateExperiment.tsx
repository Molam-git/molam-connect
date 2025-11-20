import { useState } from 'react';

interface Props {
  token: string;
  onClose: () => void;
  onCreate: () => void;
}

export default function CreateExperiment({ token, onClose, onCreate }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [variants, setVariants] = useState([
    { name: 'Control', config: {}, traffic_share: 50, is_control: true },
    { name: 'Variant A', config: {}, traffic_share: 50, is_control: false }
  ]);
  const [targeting, setTargeting] = useState('{}');
  const [submitting, setSubmitting] = useState(false);

  const handleAddVariant = () => {
    setVariants([
      ...variants,
      { name: `Variant ${String.fromCharCode(65 + variants.length - 1)}`, config: {}, traffic_share: 0, is_control: false }
    ]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const response = await fetch('/api/experiments', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name,
          description,
          targeting: JSON.parse(targeting || '{}'),
          variants: variants.map(v => ({
            ...v,
            config: typeof v.config === 'string' ? JSON.parse(v.config as any || '{}') : v.config
          }))
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create experiment');
      }

      onCreate();
    } catch (error: any) {
      alert('Error: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Create New Experiment</h2>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700"
        >
          ✕
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <div>
          <label className="block text-sm font-medium mb-2">Experiment Name</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="e.g., Checkout Button Color Test"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            rows={3}
            placeholder="Describe the experiment objective..."
          />
        </div>

        {/* Targeting */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Targeting (JSON)
            <span className="text-gray-500 text-xs ml-2">e.g., {"{"}"country": ["SN","FR"]{"}"}</span>
          </label>
          <textarea
            value={targeting}
            onChange={(e) => setTargeting(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
            rows={3}
            placeholder='{"country": ["SN"], "min_txn": 5}'
          />
        </div>

        {/* Variants */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-medium">Variants</label>
            <button
              type="button"
              onClick={handleAddVariant}
              className="px-3 py-1 text-sm bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              + Add Variant
            </button>
          </div>

          <div className="space-y-3">
            {variants.map((variant, index) => (
              <div key={index} className="border rounded-lg p-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Variant Name</label>
                    <input
                      type="text"
                      required
                      value={variant.name}
                      onChange={(e) => {
                        const newVariants = [...variants];
                        newVariants[index].name = e.target.value;
                        setVariants(newVariants);
                      }}
                      className="w-full px-3 py-1.5 text-sm border rounded"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-1">Traffic Share (%)</label>
                    <input
                      type="number"
                      required
                      min="0"
                      max="100"
                      value={variant.traffic_share}
                      onChange={(e) => {
                        const newVariants = [...variants];
                        newVariants[index].traffic_share = Number(e.target.value);
                        setVariants(newVariants);
                      }}
                      className="w-full px-3 py-1.5 text-sm border rounded"
                    />
                  </div>
                </div>

                <div className="mt-2">
                  <label className="block text-xs font-medium mb-1">Config (JSON)</label>
                  <textarea
                    value={typeof variant.config === 'string' ? variant.config : JSON.stringify(variant.config)}
                    onChange={(e) => {
                      const newVariants = [...variants];
                      newVariants[index].config = e.target.value as any;
                      setVariants(newVariants);
                    }}
                    className="w-full px-3 py-1.5 text-xs border rounded font-mono"
                    rows={2}
                    placeholder='{"button_color": "blue"}'
                  />
                </div>

                {variant.is_control && (
                  <div className="mt-2">
                    <span className="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                      Control
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 px-6 py-3 bg-primary-500 text-white rounded-2xl hover:bg-primary-600 disabled:opacity-50"
          >
            {submitting ? 'Creating...' : 'Create Experiment'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-3 bg-gray-100 rounded-2xl hover:bg-gray-200"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
