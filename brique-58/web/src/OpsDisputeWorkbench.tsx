import React, { useState, useEffect } from 'react';

interface Dispute {
  id: string;
  dispute_ref: string;
  amount: number;
  currency: string;
  status: string;
  reason_code: string;
  merchant_id: string;
  network_deadline: string | null;
  created_at: string;
}

const OpsDisputeWorkbench: React.FC = () => {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [selected, setSelected] = useState<Dispute | null>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [evidence, setEvidence] = useState<any[]>([]);
  const [filter, setFilter] = useState('reported');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDisputes();
  }, [filter]);

  useEffect(() => {
    if (selected) {
      loadDisputeDetails(selected.id);
    }
  }, [selected]);

  const loadDisputes = async () => {
    try {
      const res = await fetch(`/api/disputes?status=${filter}&limit=100`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await res.json();
      setDisputes(data);
    } catch (error) {
      console.error('Error loading disputes:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadDisputeDetails = async (id: string) => {
    try {
      const [timelineRes, evidenceRes] = await Promise.all([
        fetch(`/api/disputes/${id}/timeline`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        }),
        fetch(`/api/disputes/${id}/evidence`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        }),
      ]);

      setTimeline(await timelineRes.json());
      setEvidence(await evidenceRes.json());
    } catch (error) {
      console.error('Error loading dispute details:', error);
    }
  };

  const submitToNetwork = async () => {
    if (!selected || !confirm(`Submit dispute ${selected.dispute_ref} to network?`)) return;

    try {
      await fetch(`/api/disputes/${selected.id}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ notes: 'Submitted from ops workbench' }),
      });

      alert('Dispute submission queued');
      loadDisputes();
    } catch (error) {
      alert('Failed to submit dispute');
    }
  };

  const resolveDispute = async (outcome: 'won' | 'lost' | 'settled') => {
    if (!selected || !confirm(`Resolve dispute as ${outcome}?`)) return;

    try {
      await fetch(`/api/disputes/${selected.id}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ outcome, note: `Resolved as ${outcome} from ops` }),
      });

      alert(`Dispute resolved as ${outcome}`);
      loadDisputes();
    } catch (error) {
      alert('Failed to resolve dispute');
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      reported: 'bg-yellow-100 text-yellow-800',
      evidence_requested: 'bg-blue-100 text-blue-800',
      submitted: 'bg-purple-100 text-purple-800',
      network_review: 'bg-indigo-100 text-indigo-800',
      won: 'bg-green-100 text-green-800',
      lost: 'bg-red-100 text-red-800',
      settled: 'bg-gray-100 text-gray-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="h-screen flex">
      {/* Sidebar - Disputes List */}
      <div className="w-1/3 border-r bg-gray-50 overflow-y-auto">
        <div className="p-4 border-b bg-white">
          <h1 className="text-2xl font-bold">Disputes</h1>
          <div className="mt-3 flex gap-2">
            {['reported', 'evidence_requested', 'submitted', 'network_review'].map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`px-3 py-1 rounded text-sm ${filter === s ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
              >
                {s.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        <div className="p-2">
          {disputes.map((d) => (
            <div
              key={d.id}
              onClick={() => setSelected(d)}
              className={`p-3 mb-2 rounded cursor-pointer ${
                selected?.id === d.id ? 'bg-blue-50 border border-blue-200' : 'bg-white border border-gray-200'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-sm font-semibold">{d.dispute_ref}</span>
                <span className={`px-2 py-0.5 rounded text-xs ${getStatusColor(d.status)}`}>{d.status}</span>
              </div>
              <div className="text-sm text-gray-600">
                {d.amount.toFixed(2)} {d.currency} • {d.reason_code}
              </div>
              {d.network_deadline && (
                <div className="text-xs text-red-600 mt-1">Deadline: {new Date(d.network_deadline).toLocaleDateString()}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Main Panel - Dispute Details */}
      <div className="flex-1 overflow-y-auto">
        {!selected ? (
          <div className="flex items-center justify-center h-full text-gray-500">Select a dispute to view details</div>
        ) : (
          <div className="p-6">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-2xl font-bold">{selected.dispute_ref}</h2>
                <p className="text-gray-600">
                  {selected.amount.toFixed(2)} {selected.currency} • {selected.reason_code}
                </p>
              </div>
              <div className="flex gap-2">
                {selected.status === 'evidence_requested' && (
                  <button onClick={submitToNetwork} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                    Submit to Network
                  </button>
                )}
                {selected.status === 'network_review' && (
                  <>
                    <button onClick={() => resolveDispute('won')} className="px-4 py-2 bg-green-600 text-white rounded">
                      Mark Won
                    </button>
                    <button onClick={() => resolveDispute('lost')} className="px-4 py-2 bg-red-600 text-white rounded">
                      Mark Lost
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Evidence */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3">Evidence ({evidence.length})</h3>
              <div className="space-y-2">
                {evidence.map((e) => (
                  <div key={e.id} className="p-3 bg-white border rounded flex items-center justify-between">
                    <div>
                      <div className="font-medium">{e.file_name}</div>
                      <div className="text-sm text-gray-600">
                        {e.evidence_type} • {(e.file_size / 1024).toFixed(1)} KB
                      </div>
                    </div>
                    <button className="text-blue-600 hover:underline text-sm">Download</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Timeline */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Timeline</h3>
              <div className="space-y-3">
                {timeline.map((event) => (
                  <div key={event.id} className="flex gap-3">
                    <div className="w-2 h-2 mt-2 rounded-full bg-blue-600"></div>
                    <div className="flex-1">
                      <div className="font-medium">{event.action}</div>
                      <div className="text-sm text-gray-600">{new Date(event.created_at).toLocaleString()}</div>
                      {event.payload && Object.keys(event.payload).length > 0 && (
                        <pre className="text-xs bg-gray-100 p-2 rounded mt-1 overflow-x-auto">
                          {JSON.stringify(event.payload, null, 2)}
                        </pre>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OpsDisputeWorkbench;
