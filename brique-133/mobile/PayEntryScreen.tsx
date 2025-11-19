// ============================================================================
// Molam Pay Entry Screen - React Native (Mobile)
// ============================================================================

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Dimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

const { width } = Dimensions.get("window");

interface PayEntryData {
  user_id: string;
  preferred_module?: string;
  last_module_used?: string;
  modules_enabled: string[];
  auto_redirect: boolean;
  redirect_target?: string;
  locale: string;
}

export default function PayEntryScreen({ navigation }: any) {
  const [entry, setEntry] = useState<PayEntryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEntry();
    trackAccess();
  }, []);

  async function fetchEntry() {
    try {
      const res = await fetch("/api/pay/entry", {
        headers: {
          Authorization: `Bearer ${global.authToken}`,
        },
      });
      const data = await res.json();
      setEntry(data);

      // Auto-redirect if enabled
      if (data.auto_redirect && data.redirect_target) {
        setTimeout(() => {
          navigateToModule(data.redirect_target);
        }, 500);
      }
    } catch (e) {
      console.error("Failed to fetch pay entry:", e);
    } finally {
      setLoading(false);
    }
  }

  async function trackAccess() {
    try {
      await fetch("/api/pay/track", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${global.authToken}`,
        },
        body: JSON.stringify({
          module: "pay_entry",
          device_type: "mobile",
          platform: Platform.OS,
        }),
      });
    } catch (e) {
      console.error("Failed to track access:", e);
    }
  }

  function navigateToModule(module: string) {
    // Track module access
    fetch("/api/pay/track", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${global.authToken}`,
      },
      body: JSON.stringify({
        module,
        device_type: "mobile",
        platform: Platform.OS,
      }),
    });

    // Navigate
    if (module === "wallet") {
      navigation.navigate("WalletHome");
    } else if (module === "connect") {
      navigation.navigate("ConnectDashboard");
    } else if (module === "eats") {
      navigation.navigate("EatsHome");
    } else if (module === "shop") {
      navigation.navigate("ShopHome");
    } else if (module === "talk") {
      navigation.navigate("TalkHome");
    } else if (module === "ads") {
      navigation.navigate("AdsHome");
    }
  }

  async function enableModule(module: string) {
    try {
      await fetch(`/api/pay/modules/${module}/enable`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${global.authToken}`,
        },
      });
      fetchEntry(); // Refresh
    } catch (e) {
      console.error("Failed to enable module:", e);
    }
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#0066FF" />
      </View>
    );
  }

  if (!entry) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Erreur de chargement</Text>
      </View>
    );
  }

  // If auto-redirect is enabled, show loading screen
  if (entry.auto_redirect && entry.redirect_target) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#0066FF" />
        <Text style={styles.redirectText}>
          Redirection vers {entry.redirect_target}...
        </Text>
      </View>
    );
  }

  return (
    <LinearGradient colors={["#FFFFFF", "#F5F7FA"]} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Bienvenue sur Molam Pay</Text>
        <Text style={styles.subtitle}>
          Choisissez votre module préféré
        </Text>
      </View>

      {/* Main Module Buttons */}
      <View style={styles.modulesContainer}>
        {/* Molam Ma (Wallet) */}
        {entry.modules_enabled.includes("wallet") && (
          <TouchableOpacity
            style={styles.moduleButton}
            onPress={() => navigateToModule("wallet")}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={["#0066FF", "#0052CC"]}
              style={styles.moduleGradient}
            >
              <Text style={styles.moduleIcon}>💳</Text>
              <Text style={styles.moduleName}>Molam Ma</Text>
              <Text style={styles.moduleDesc}>Wallet</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}

        {/* Molam Connect */}
        {entry.modules_enabled.includes("connect") && (
          <TouchableOpacity
            style={styles.moduleButton}
            onPress={() => navigateToModule("connect")}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={["#10B981", "#059669"]}
              style={styles.moduleGradient}
            >
              <Text style={styles.moduleIcon}>🏪</Text>
              <Text style={styles.moduleName}>Molam Connect</Text>
              <Text style={styles.moduleDesc}>Merchants</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>

      {/* Additional Modules */}
      <View style={styles.additionalModules}>
        <Text style={styles.sectionTitle}>Autres modules</Text>

        <View style={styles.moduleGrid}>
          {["eats", "shop", "talk", "ads"].map((module) => (
            <TouchableOpacity
              key={module}
              style={styles.smallModule}
              onPress={() =>
                entry.modules_enabled.includes(module)
                  ? navigateToModule(module)
                  : enableModule(module)
              }
            >
              <View
                style={[
                  styles.smallModuleInner,
                  entry.modules_enabled.includes(module)
                    ? styles.enabledModule
                    : styles.disabledModule,
                ]}
              >
                <Text style={styles.smallModuleIcon}>
                  {module === "eats"
                    ? "🍔"
                    : module === "shop"
                    ? "🛍️"
                    : module === "talk"
                    ? "💬"
                    : "📢"}
                </Text>
                <Text style={styles.smallModuleName}>
                  {module.charAt(0).toUpperCase() + module.slice(1)}
                </Text>
                {!entry.modules_enabled.includes(module) && (
                  <Text style={styles.enableBadge}>Activer</Text>
                )}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  header: {
    alignItems: "center",
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#1F2937",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#6B7280",
  },
  modulesContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 40,
  },
  moduleButton: {
    width: width * 0.4,
    height: width * 0.4,
    borderRadius: width * 0.2,
    overflow: "hidden",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  moduleGradient: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  moduleIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  moduleName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  moduleDesc: {
    fontSize: 12,
    color: "#E5E7EB",
  },
  additionalModules: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 16,
  },
  moduleGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  smallModule: {
    width: "48%",
    marginBottom: 12,
  },
  smallModuleInner: {
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  enabledModule: {
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#0066FF",
  },
  disabledModule: {
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },
  smallModuleIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  smallModuleName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  enableBadge: {
    marginTop: 4,
    fontSize: 10,
    color: "#0066FF",
    fontWeight: "600",
  },
  redirectText: {
    marginTop: 16,
    fontSize: 14,
    color: "#6B7280",
  },
  errorText: {
    fontSize: 16,
    color: "#EF4444",
  },
});
