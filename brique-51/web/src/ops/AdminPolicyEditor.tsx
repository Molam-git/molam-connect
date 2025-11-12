/**
 * Brique 51bis - Merchant Refund Policies & Zones
 * Ops Policy Editor (React + Apple-like Design)
 */

import React, { useState, useEffect } from "react";

interface PolicyConfig {
  reverse_window_minutes?: number;
  max_refund_amount_absolute?: number;
  max_refund_amount_percent?: number;
  auto_approve?: boolean;
  require_ops_approval_above?: number;
  chargeback_handling?: "merchant" | "molam" | "shared";
  allowed_methods?: string[];
  ttl_for_customer_request_days?: number;
  sira_threshold_auto_approve?: number;
}

interface Policy {
  id?: string;
  scope: string;
  scope_id?: string;
  name: string;
  description?: string;
  config: PolicyConfig;
  status?: string;
}

export default function AdminPolicyEditor({ policyId }: { policyId?: string }) {
  const [policy, setPolicy] = useState<Policy>({
    scope: "global",
    name: "",
    description: "",
    config: {
      reverse_window_minutes: 30,
      max_refund_amount_absolute: 5000,
      max_refund_amount_percent: 100,
      auto_approve: false,
      require_ops_approval_above: 1000,
      chargeback_handling: "merchant",
      allowed_methods: ["wallet", "card", "bank"],
      ttl_for_customer_request_days: 30,
      sira_threshold_auto_approve: 0.3,
    },
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (policyId) {
      loadPolicy();
    }
  }, [policyId]);

  async function loadPolicy() {
    setLoading(true);
    try {
      const res = await fetch(`/api/policies/${policyId}`);
      const data = await res.json();
      setPolicy(data);
    } catch (err) {
      console.error("Failed to load policy:", err);
    }
    setLoading(false);
  }

  async function save() {
    try {
      const url = policyId ? `/api/policies/${policyId}` : "/api/policies";
      const method = policyId ? "PUT" : "POST";

      await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(policy),
      });

      alert("Policy saved successfully");
    } catch (err) {
      alert("Failed to save policy: " + String(err));
    }
  }

  const updateConfig = (key: keyof PolicyConfig, value: any) => {
    setPolicy({
      ...policy,
      config: {
        ...policy.config,
        [key]: value,
      },
    });
  };

  return (
    <div className="policy-editor">
      <style>{`
        .policy-editor {
          min-height: 100vh;
          padding: 32px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        }
        .card {
          background: white;
          border-radius: 16px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.12);
          padding: 32px;
          max-width: 800px;
          margin: 0 auto;
        }
        h1 {
          font-size: 28px;
          font-weight: 700;
          margin: 0 0 24px 0;
          color: #1d1d1f;
        }
        .form-group {
          margin-bottom: 24px;
        }
        label {
          display: block;
          font-size: 14px;
          font-weight: 600;
          color: #1d1d1f;
          margin-bottom: 8px;
        }
        input[type="text"],
        input[type="number"],
        select,
        textarea {
          width: 100%;
          padding: 12px 16px;
          border: 2px solid #e5e5ea;
          border-radius: 8px;
          font-size: 14px;
          transition: border-color 0.2s;
        }
        input:focus, select:focus, textarea:focus {
          outline: none;
          border-color: #667eea;
        }
        textarea {
          resize: vertical;
          min-height: 80px;
        }
        .checkbox-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        input[type="checkbox"] {
          width: 20px;
          height: 20px;
        }
        .btn {
          padding: 12px 24px;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-primary {
          background: #667eea;
          color: white;
        }
        .btn-primary:hover {
          background: #5568d3;
          transform: translateY(-1px);
        }
        .section-title {
          font-size: 18px;
          font-weight: 600;
          color: #667eea;
          margin: 32px 0 16px 0;
          padding-bottom: 8px;
          border-bottom: 2px solid #e5e5ea;
        }
      `}</style>

      <div className="card">
        <h1>{policyId ? "Edit" : "Create"} Refund Policy</h1>

        <div className="form-group">
          <label>Scope</label>
          <select value={policy.scope} onChange={(e) => setPolicy({ ...policy, scope: e.target.value })}>
            <option value="global">Global</option>
            <option value="zone">Zone</option>
            <option value="merchant">Merchant</option>
            <option value="sub_account">Sub Account</option>
          </select>
        </div>

        <div className="form-group">
          <label>Policy Name</label>
          <input
            type="text"
            value={policy.name}
            onChange={(e) => setPolicy({ ...policy, name: e.target.value })}
            placeholder="e.g., CEDEAO Lenient Policy"
          />
        </div>

        <div className="form-group">
          <label>Description</label>
          <textarea
            value={policy.description || ""}
            onChange={(e) => setPolicy({ ...policy, description: e.target.value })}
            placeholder="Describe the policy purpose..."
          />
        </div>

        <div className="section-title">Policy Configuration</div>

        <div className="form-group">
          <label>Reversal Window (minutes)</label>
          <input
            type="number"
            value={policy.config.reverse_window_minutes}
            onChange={(e) => updateConfig("reverse_window_minutes", Number(e.target.value))}
          />
        </div>

        <div className="form-group">
          <label>Max Refund Amount (absolute)</label>
          <input
            type="number"
            value={policy.config.max_refund_amount_absolute}
            onChange={(e) => updateConfig("max_refund_amount_absolute", Number(e.target.value))}
          />
        </div>

        <div className="form-group">
          <label>Max Refund Amount (%)</label>
          <input
            type="number"
            value={policy.config.max_refund_amount_percent}
            onChange={(e) => updateConfig("max_refund_amount_percent", Number(e.target.value))}
          />
        </div>

        <div className="form-group">
          <div className="checkbox-group">
            <input
              type="checkbox"
              checked={policy.config.auto_approve}
              onChange={(e) => updateConfig("auto_approve", e.target.checked)}
            />
            <label style={{ margin: 0 }}>Auto Approve</label>
          </div>
        </div>

        <div className="form-group">
          <label>Require Ops Approval Above</label>
          <input
            type="number"
            value={policy.config.require_ops_approval_above}
            onChange={(e) => updateConfig("require_ops_approval_above", Number(e.target.value))}
          />
        </div>

        <div className="form-group">
          <label>Chargeback Handling</label>
          <select
            value={policy.config.chargeback_handling}
            onChange={(e) => updateConfig("chargeback_handling", e.target.value)}
          >
            <option value="merchant">Merchant</option>
            <option value="molam">Molam</option>
            <option value="shared">Shared</option>
          </select>
        </div>

        <div className="form-group">
          <label>Customer Request TTL (days)</label>
          <input
            type="number"
            value={policy.config.ttl_for_customer_request_days}
            onChange={(e) => updateConfig("ttl_for_customer_request_days", Number(e.target.value))}
          />
        </div>

        <div className="form-group">
          <label>SIRA Auto-Approve Threshold (0-1)</label>
          <input
            type="number"
            step="0.1"
            min="0"
            max="1"
            value={policy.config.sira_threshold_auto_approve}
            onChange={(e) => updateConfig("sira_threshold_auto_approve", Number(e.target.value))}
          />
        </div>

        <button className="btn btn-primary" onClick={save}>
          {loading ? "Saving..." : "Save Policy"}
        </button>
      </div>
    </div>
  );
}
