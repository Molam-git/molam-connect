// ============================================================================
// Freeze Button Widget - Web (React)
// ============================================================================

import React, { useState } from "react";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";

interface FreezeButtonProps {
  scope: "global" | string;
  onSuccess?: () => void;
  apiUrl?: string;
  token: string;
}

export const FreezeButton: React.FC<FreezeButtonProps> = ({
  scope,
  onSuccess,
  apiUrl = "https://api.molam.com",
  token,
}) => {
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const handleFreeze = async () => {
    if (!reason.trim()) {
      setError("Reason is required");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const idempotencyKey = `freeze-${Date.now()}-${uuidv4()}`;

      await axios.post(
        `${apiUrl}/api/ops/freeze-payouts`,
        { scope, reason },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Idempotency-Key": idempotencyKey,
            "Content-Type": "application/json",
          },
        }
      );

      setShowConfirm(false);
      setReason("");
      onSuccess?.();
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to freeze payouts");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <button
        onClick={() => setShowConfirm(true)}
        disabled={loading}
        style={{
          ...styles.button,
          ...(loading ? styles.buttonDisabled : {}),
        }}
      >
        {loading ? "Freezing..." : "🧊 Freeze Payouts"}
      </button>

      {showConfirm && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <h3 style={styles.modalTitle}>Confirm Freeze</h3>
            <p style={styles.modalText}>
              Are you sure you want to freeze{" "}
              {scope === "global" ? "all payouts" : `payouts for ${scope}`}?
            </p>

            <label style={styles.label}>
              Reason:
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Emergency maintenance, bank outage, etc."
                style={styles.input}
                autoFocus
              />
            </label>

            {error && <div style={styles.error}>{error}</div>}

            <div style={styles.modalActions}>
              <button
                onClick={handleFreeze}
                disabled={loading || !reason.trim()}
                style={{
                  ...styles.confirmButton,
                  ...(loading || !reason.trim() ? styles.buttonDisabled : {}),
                }}
              >
                {loading ? "Freezing..." : "Confirm Freeze"}
              </button>
              <button
                onClick={() => {
                  setShowConfirm(false);
                  setReason("");
                  setError("");
                }}
                disabled={loading}
                style={styles.cancelButton}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: "inline-block",
  },
  button: {
    padding: "12px 24px",
    fontSize: "16px",
    fontWeight: 600,
    color: "#fff",
    backgroundColor: "#ef4444",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  buttonDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  modal: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: "#fff",
    padding: "24px",
    borderRadius: "12px",
    maxWidth: "500px",
    width: "90%",
    boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
  },
  modalTitle: {
    margin: "0 0 16px 0",
    fontSize: "20px",
    fontWeight: 700,
    color: "#1f2937",
  },
  modalText: {
    margin: "0 0 16px 0",
    fontSize: "14px",
    color: "#6b7280",
  },
  label: {
    display: "block",
    marginBottom: "16px",
    fontSize: "14px",
    fontWeight: 600,
    color: "#374151",
  },
  input: {
    display: "block",
    width: "100%",
    marginTop: "8px",
    padding: "10px 12px",
    fontSize: "14px",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    outline: "none",
  },
  error: {
    marginBottom: "16px",
    padding: "10px 12px",
    fontSize: "14px",
    color: "#dc2626",
    backgroundColor: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: "6px",
  },
  modalActions: {
    display: "flex",
    gap: "12px",
    justifyContent: "flex-end",
  },
  confirmButton: {
    padding: "10px 20px",
    fontSize: "14px",
    fontWeight: 600,
    color: "#fff",
    backgroundColor: "#ef4444",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
  },
  cancelButton: {
    padding: "10px 20px",
    fontSize: "14px",
    fontWeight: 600,
    color: "#374151",
    backgroundColor: "#f3f4f6",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
  },
};
