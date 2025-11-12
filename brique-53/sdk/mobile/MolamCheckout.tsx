/**
 * Molam Checkout Mobile SDK - React Native Component
 *
 * Usage:
 * import { MolamCheckoutButton } from '@molam/connect-checkout-mobile';
 *
 * <MolamCheckoutButton
 *   sessionUrl="https://checkout.molam.com/checkout/session-id"
 *   onSuccess={() => console.log('Success!')}
 * />
 */
import React, { useState } from "react";
import { Button, Linking, Modal, View, StyleSheet, TouchableOpacity, Text } from "react-native";
import { WebView } from "react-native-webview";

interface MolamCheckoutButtonProps {
  sessionUrl: string;
  label?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
  onError?: (error: Error) => void;
  mode?: "browser" | "modal";
}

export function MolamCheckoutButton({
  sessionUrl,
  label = "Subscribe Now",
  onSuccess,
  onCancel,
  onError,
  mode = "browser",
}: MolamCheckoutButtonProps) {
  const [modalVisible, setModalVisible] = useState(false);

  const handlePress = () => {
    if (mode === "browser") {
      Linking.openURL(sessionUrl);
    } else {
      setModalVisible(true);
    }
  };

  const handleNavigationStateChange = (navState: any) => {
    // Check if redirected to success URL
    if (navState.url.includes("success")) {
      setModalVisible(false);
      onSuccess?.();
    } else if (navState.url.includes("cancel")) {
      setModalVisible(false);
      onCancel?.();
    }
  };

  return (
    <>
      <Button title={label} onPress={handlePress} color="#4F46E5" />

      <Modal
        animationType="slide"
        transparent={false}
        visible={modalVisible}
        onRequestClose={() => {
          setModalVisible(false);
          onCancel?.();
        }}
      >
        <View style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => {
                setModalVisible(false);
                onCancel?.();
              }}
              style={styles.closeButton}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Checkout</Text>
          </View>
          <WebView
            source={{ uri: sessionUrl }}
            onNavigationStateChange={handleNavigationStateChange}
            style={styles.webview}
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 24,
    color: "#6b7280",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginLeft: 16,
  },
  webview: {
    flex: 1,
  },
});

/**
 * Swift/Kotlin Native SDK Interface (example)
 *
 * Swift:
 * import MolamCheckout
 *
 * let checkout = MolamCheckout(sessionURL: "https://...")
 * checkout.present(from: self) { result in
 *   switch result {
 *   case .success:
 *     print("Subscription created!")
 *   case .cancelled:
 *     print("User cancelled")
 *   case .failure(let error):
 *     print("Error: \(error)")
 *   }
 * }
 *
 * Kotlin:
 * import com.molam.checkout.MolamCheckout
 *
 * MolamCheckout.Builder()
 *   .setSessionUrl("https://...")
 *   .setListener(object : CheckoutListener {
 *     override fun onSuccess() {
 *       // Subscription created
 *     }
 *     override fun onCancel() {
 *       // User cancelled
 *     }
 *     override fun onError(error: Exception) {
 *       // Handle error
 *     }
 *   })
 *   .build()
 *   .present(activity)
 */
