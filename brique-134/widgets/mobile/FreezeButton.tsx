// ============================================================================
// Freeze Button Widget - Mobile (React Native)
// ============================================================================

import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import axios from "axios";

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
  const [showModal, setShowModal] = useState(false);
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
      const idempotencyKey = `freeze-${Date.now()}-${Math.random()}`;

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

      setShowModal(false);
      setReason("");
      Alert.alert("Success", "Payouts frozen successfully");
      onSuccess?.();
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to freeze payouts");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <TouchableOpacity
        style={styles.button}
        onPress={() => setShowModal(true)}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? "Freezing..." : "🧊 Freeze Payouts"}
        </Text>
      </TouchableOpacity>

      <Modal
        visible={showModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Confirm Freeze</Text>
            <Text style={styles.modalText}>
              Are you sure you want to freeze{" "}
              {scope === "global" ? "all payouts" : `payouts for ${scope}`}?
            </Text>

            <Text style={styles.label}>Reason:</Text>
            <TextInput
              style={styles.input}
              value={reason}
              onChangeText={setReason}
              placeholder="Emergency maintenance, bank outage, etc."
              autoFocus
              editable={!loading}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={styles.modalActions}>
              {loading ? (
                <ActivityIndicator size="large" color="#ef4444" />
              ) : (
                <>
                  <TouchableOpacity
                    style={[styles.confirmButton, !reason.trim() && styles.buttonDisabled]}
                    onPress={handleFreeze}
                    disabled={!reason.trim()}
                  >
                    <Text style={styles.confirmButtonText}>Confirm Freeze</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => {
                      setShowModal(false);
                      setReason("");
                      setError("");
                    }}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  button: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: "#ef4444",
    borderRadius: 8,
    alignItems: "center",
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#fff",
    padding: 24,
    borderRadius: 12,
    width: "90%",
    maxWidth: 500,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1f2937",
    marginBottom: 12,
  },
  modalText: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 6,
    padding: 12,
    fontSize: 14,
    marginBottom: 16,
  },
  error: {
    fontSize: 14,
    color: "#dc2626",
    backgroundColor: "#fef2f2",
    padding: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#fecaca",
    marginBottom: 16,
  },
  modalActions: {
    gap: 12,
  },
  confirmButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: "#ef4444",
    borderRadius: 6,
    alignItems: "center",
    marginBottom: 8,
  },
  confirmButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: "#f3f4f6",
    borderRadius: 6,
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
