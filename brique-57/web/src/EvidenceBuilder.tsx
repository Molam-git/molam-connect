import React, { useState, useEffect } from 'react';

interface EvidencePackage {
  id: string;
  merchant_id: string;
  dispute_id: string | null;
  package_type: string;
  status: string;
  documents: any[];
  template_id: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

const EvidenceBuilder: React.FC = () => {
  const [packages, setPackages] = useState<EvidencePackage[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<EvidencePackage | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);

  // Create package form
  const [newPackage, setNewPackage] = useState({
    dispute_id: '',
    package_type: 'chargeback_rebuttal' as 'chargeback_rebuttal' | 'fraud_claim' | 'pre_arbitration' | 'custom',
  });

  useEffect(() => {
    loadPackages();
  }, []);

  const loadPackages = async () => {
    try {
      const res = await fetch('/api/merchant-protection/evidence', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await res.json();
      setPackages(data);
    } catch (error) {
      console.error('Error loading evidence packages:', error);
    } finally {
      setLoading(false);
    }
  };

  const createPackage = async () => {
    try {
      const res = await fetch('/api/merchant-protection/evidence', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(newPackage),
      });

      if (res.ok) {
        await loadPackages();
        setShowCreateModal(false);
        setNewPackage({ dispute_id: '', package_type: 'chargeback_rebuttal' });
      } else {
        alert('Failed to create evidence package');
      }
    } catch (error) {
      console.error('Error creating package:', error);
      alert('Failed to create evidence package');
    }
  };

  const uploadDocument = async (packageId: string, file: File, documentType: string) => {
    setUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('document_type', documentType);

      const res = await fetch(`/api/merchant-protection/evidence/${packageId}/documents`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: formData,
      });

      if (res.ok) {
        const updated = await res.json();
        setSelectedPackage(updated);
        await loadPackages();
      } else {
        alert('Failed to upload document');
      }
    } catch (error) {
      console.error('Error uploading document:', error);
      alert('Failed to upload document');
    } finally {
      setUploadingFile(false);
    }
  };

  const submitPackage = async (packageId: string) => {
    if (!confirm('Submit this evidence package? It will be locked and cannot be modified.')) return;

    try {
      const res = await fetch(`/api/merchant-protection/evidence/${packageId}/submit`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (res.ok) {
        await loadPackages();
        const updated = await res.json();
        setSelectedPackage(updated);
        alert('Evidence package submitted successfully!');
      } else {
        alert('Failed to submit evidence package');
      }
    } catch (error) {
      console.error('Error submitting package:', error);
      alert('Failed to submit evidence package');
    }
  };

  const deleteDocument = async (packageId: string, documentId: string) => {
    if (!confirm('Delete this document?')) return;

    try {
      const res = await fetch(`/api/merchant-protection/evidence/${packageId}/documents/${documentId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (res.ok) {
        const updated = await res.json();
        setSelectedPackage(updated);
        await loadPackages();
      } else {
        alert('Failed to delete document');
      }
    } catch (error) {
      console.error('Error deleting document:', error);
      alert('Failed to delete document');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded">Draft</span>;
      case 'submitted':
        return <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">Submitted</span>;
      default:
        return <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded">{status}</span>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading evidence packages...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Evidence Builder</h1>
          <p className="text-gray-600 mt-1">Create and manage dispute evidence packages</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Create Package
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Packages List */}
        <div className="lg:col-span-1 bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Packages ({packages.length})</h2>
          <div className="space-y-2">
            {packages.length === 0 ? (
              <div className="text-sm text-gray-500 text-center py-8">No evidence packages yet</div>
            ) : (
              packages.map((pkg) => (
                <div
                  key={pkg.id}
                  onClick={() => setSelectedPackage(pkg)}
                  className={`p-3 rounded cursor-pointer hover:bg-gray-50 ${
                    selectedPackage?.id === pkg.id ? 'bg-blue-50 border border-blue-200' : 'border border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-900">{pkg.package_type}</span>
                    {getStatusBadge(pkg.status)}
                  </div>
                  <div className="text-xs text-gray-500">
                    {pkg.documents.length} document{pkg.documents.length !== 1 ? 's' : ''}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {new Date(pkg.created_at).toLocaleDateString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Package Details */}
        <div className="lg:col-span-2 bg-white rounded-lg shadow p-6">
          {!selectedPackage ? (
            <div className="flex items-center justify-center h-64 text-gray-500">
              Select a package to view details
            </div>
          ) : (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{selectedPackage.package_type}</h2>
                  <div className="flex items-center gap-3 mt-2">
                    {getStatusBadge(selectedPackage.status)}
                    {selectedPackage.dispute_id && (
                      <span className="text-sm text-gray-600">Dispute: {selectedPackage.dispute_id.slice(0, 8)}...</span>
                    )}
                  </div>
                </div>
                {selectedPackage.status === 'draft' && (
                  <button
                    onClick={() => submitPackage(selectedPackage.id)}
                    disabled={selectedPackage.documents.length === 0}
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Submit Package
                  </button>
                )}
              </div>

              {/* Upload Document */}
              {selectedPackage.status === 'draft' && (
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
                  <h3 className="text-sm font-medium text-gray-900 mb-3">Add Documents</h3>
                  <div className="space-y-3">
                    {['proof_of_delivery', 'invoice', 'customer_communication', 'refund_policy', 'terms_of_service', 'other'].map(
                      (docType) => (
                        <div key={docType} className="flex items-center gap-3">
                          <input
                            type="file"
                            id={`upload-${docType}`}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) uploadDocument(selectedPackage.id, file, docType);
                            }}
                            disabled={uploadingFile}
                            className="hidden"
                          />
                          <label
                            htmlFor={`upload-${docType}`}
                            className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 cursor-pointer text-sm text-center"
                          >
                            Upload {docType.replace(/_/g, ' ')}
                          </label>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}

              {/* Documents List */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-3">
                  Documents ({selectedPackage.documents.length})
                </h3>
                {selectedPackage.documents.length === 0 ? (
                  <div className="text-sm text-gray-500 text-center py-8 border border-gray-200 rounded">
                    No documents uploaded yet
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedPackage.documents.map((doc: any) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between p-3 border border-gray-200 rounded hover:bg-gray-50"
                      >
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-900">{doc.file_name}</div>
                          <div className="text-xs text-gray-500 mt-1">
                            <span className="px-2 py-0.5 bg-gray-100 rounded">{doc.document_type}</span>
                            <span className="ml-2">{(doc.size / 1024).toFixed(1)} KB</span>
                            <span className="ml-2">{new Date(doc.uploaded_at).toLocaleString()}</span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button className="text-sm text-blue-600 hover:text-blue-900">Download</button>
                          {selectedPackage.status === 'draft' && (
                            <button
                              onClick={() => deleteDocument(selectedPackage.id, doc.id)}
                              className="text-sm text-red-600 hover:text-red-900"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Metadata */}
              <div className="text-xs text-gray-500 space-y-1 pt-4 border-t">
                <div>Package ID: {selectedPackage.id}</div>
                <div>Created: {new Date(selectedPackage.created_at).toLocaleString()}</div>
                {selectedPackage.submitted_at && (
                  <div>Submitted: {new Date(selectedPackage.submitted_at).toLocaleString()}</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Package Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Create Evidence Package</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Package Type</label>
                <select
                  value={newPackage.package_type}
                  onChange={(e) => setNewPackage({ ...newPackage, package_type: e.target.value as any })}
                  className="w-full px-3 py-2 border rounded"
                >
                  <option value="chargeback_rebuttal">Chargeback Rebuttal</option>
                  <option value="fraud_claim">Fraud Claim</option>
                  <option value="pre_arbitration">Pre-Arbitration</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Dispute ID (optional)
                </label>
                <input
                  type="text"
                  value={newPackage.dispute_id}
                  onChange={(e) => setNewPackage({ ...newPackage, dispute_id: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="Enter dispute ID..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded"
              >
                Cancel
              </button>
              <button
                onClick={createPackage}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Create Package
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EvidenceBuilder;
