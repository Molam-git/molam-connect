/**
 * Molam Ma Wallet Mobile App (React Native / Expo)
 * Native mobile wallet experience with QR scanning
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  SafeAreaView,
  StatusBar,
  Alert,
  Platform
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { BarCodeScanner } from 'expo-barcode-scanner';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface WalletData {
  user: {
    id: string;
    locale: string;
    currency: string;
    country: string;
  };
  balance: {
    balance: number;
    currency: string;
    status: string;
  };
  actions: Array<{
    k: string;
    l: string;
    e: string;
    icon: string;
    sub?: Array<{ k: string; l: string; e: string; icon: string }>;
  }>;
  history: Array<{
    id: string;
    label: string;
    amount: number;
    currency: string;
    type: string;
    category: string;
    timestamp: string;
  }>;
}

interface QrTokenData {
  token: string;
  expires_at: string;
  qr_url: string;
  deep_link: string;
}

const API_BASE = 'https://api.molam.io'; // Change to your API endpoint

export default function App() {
  const [walletData, setWalletData] = useState<WalletData | null>(null);
  const [qrToken, setQrToken] = useState<QrTokenData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [scannerMode, setScannerMode] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [selectedAction, setSelectedAction] = useState<string | null>(null);

  useEffect(() => {
    fetchWalletData();
    requestCameraPermission();
  }, []);

  const requestCameraPermission = async () => {
    const { status } = await BarCodeScanner.requestPermissionsAsync();
    setHasPermission(status === 'granted');
  };

  const fetchWalletData = async () => {
    try {
      const token = await AsyncStorage.getItem('molam_token');
      if (!token) {
        Alert.alert('Error', 'Please log in first');
        return;
      }

      const response = await fetch(`${API_BASE}/api/wallet/home`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) throw new Error('Failed to fetch wallet data');

      const data = await response.json();
      setWalletData(data);
    } catch (error: any) {
      console.error('Error fetching wallet:', error);
      Alert.alert('Error', 'Failed to load wallet data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const generateQrCode = async () => {
    try {
      const token = await AsyncStorage.getItem('molam_token');
      const response = await fetch(`${API_BASE}/api/wallet/qr/generate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          purpose: 'receive',
          expiryMinutes: 15
        })
      });

      if (!response.ok) throw new Error('Failed to generate QR');

      const data = await response.json();
      setQrToken(data);
      setShowQr(true);

      // Auto-hide after 15 minutes
      setTimeout(() => {
        setShowQr(false);
        setQrToken(null);
      }, 15 * 60 * 1000);
    } catch (error: any) {
      console.error('Error generating QR:', error);
      Alert.alert('Error', 'Failed to generate QR code');
    }
  };

  const handleBarCodeScanned = async ({ data }: { type: string; data: string }) => {
    setScannerMode(false);

    try {
      // Extract token from molam://pay/{token} or https://pay.molam.io/qr/{token}
      const tokenMatch = data.match(/(?:molam:\/\/pay\/|qr\/)([^\/\?]+)/);
      if (!tokenMatch) {
        Alert.alert('Invalid QR', 'This is not a valid Molam payment QR code');
        return;
      }

      const qrTokenStr = tokenMatch[1];

      // Confirm payment
      Alert.alert(
        'Confirm Payment',
        'Scan the QR code amount?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Pay',
            onPress: async () => {
              try {
                const token = await AsyncStorage.getItem('molam_token');
                const response = await fetch(`${API_BASE}/api/wallet/qr/scan`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({ token: qrTokenStr })
                });

                if (!response.ok) {
                  const error = await response.json();
                  throw new Error(error.message || 'Payment failed');
                }

                Alert.alert('Success', 'Payment completed successfully');
                fetchWalletData(); // Refresh wallet
              } catch (error: any) {
                Alert.alert('Payment Failed', error.message);
              }
            }
          }
        ]
      );
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleActionClick = (actionKey: string) => {
    if (actionKey === 'transfer' || actionKey === 'merchant_payment') {
      // Open QR scanner
      if (hasPermission) {
        setScannerMode(true);
      } else {
        Alert.alert('Camera Permission', 'Please grant camera permission to scan QR codes');
        requestCameraPermission();
      }
    } else {
      setSelectedAction(actionKey);
      Alert.alert('Action', `${actionKey} feature coming soon`);
    }
  };

  const formatAmount = (amount: number, currency: string) => {
    const absAmount = Math.abs(amount);
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: currency
    }).format(absAmount);
  };

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (scannerMode) {
    return (
      <SafeAreaView style={styles.scanner}>
        <StatusBar barStyle="light-content" />
        <BarCodeScanner
          onBarCodeScanned={handleBarCodeScanned}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.scannerOverlay}>
          <Text style={styles.scannerText}>Scan Molam QR Code</Text>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => setScannerMode(false)}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading wallet...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!walletData) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>Failed to load wallet</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => {
            setRefreshing(true);
            fetchWalletData();
          }} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Molam Ma</Text>
          <TouchableOpacity>
            <Text style={styles.headerIcon}>⚙️</Text>
          </TouchableOpacity>
        </View>

        {/* Balance Card */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Your Balance</Text>
          <Text style={styles.balanceAmount}>
            {formatAmount(walletData.balance.balance, walletData.balance.currency)}
          </Text>

          {/* QR Code */}
          {showQr && qrToken ? (
            <View style={styles.qrContainer}>
              <View style={styles.qrCodeWrapper}>
                <QRCode value={qrToken.qr_url} size={200} />
              </View>
              <Text style={styles.qrExpiry}>
                Expires: {new Date(qrToken.expires_at).toLocaleTimeString()}
              </Text>
              <TouchableOpacity onPress={() => setShowQr(false)}>
                <Text style={styles.hideQrText}>Hide QR</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.showQrButton} onPress={generateQrCode}>
              <Text style={styles.showQrButtonText}>Show QR to Receive</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Quick Actions */}
        <View style={styles.actionsSection}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionsGrid}>
            {walletData.actions.filter(a => !a.sub).slice(0, 6).map((action) => (
              <TouchableOpacity
                key={action.k}
                style={styles.actionButton}
                onPress={() => handleActionClick(action.k)}
              >
                <Text style={styles.actionEmoji}>{action.e}</Text>
                <Text style={styles.actionLabel}>{action.l}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Bills Section */}
          {walletData.actions.find(a => a.sub) && (
            <View style={styles.billsSection}>
              <TouchableOpacity
                style={styles.billsHeader}
                onPress={() => setSelectedAction(selectedAction === 'bills' ? null : 'bills')}
              >
                <View style={styles.billsHeaderLeft}>
                  <Text style={styles.actionEmoji}>📡</Text>
                  <Text style={styles.billsHeaderText}>Bills & Services</Text>
                </View>
                <Text style={styles.chevron}>{selectedAction === 'bills' ? '▲' : '▼'}</Text>
              </TouchableOpacity>

              {selectedAction === 'bills' && (
                <View style={styles.subActionsGrid}>
                  {walletData.actions.find(a => a.sub)?.sub?.map((subAction) => (
                    <TouchableOpacity
                      key={subAction.k}
                      style={styles.subActionButton}
                      onPress={() => handleActionClick(subAction.k)}
                    >
                      <Text style={styles.subActionEmoji}>{subAction.e}</Text>
                      <Text style={styles.subActionLabel}>{subAction.l}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}
        </View>

        {/* Transaction History */}
        <View style={styles.historySection}>
          <Text style={styles.sectionTitle}>Recent Transactions</Text>

          {walletData.history.length === 0 ? (
            <View style={styles.emptyHistory}>
              <Text style={styles.emptyHistoryText}>No transactions yet</Text>
            </View>
          ) : (
            <View style={styles.historyList}>
              {walletData.history.slice(0, 20).map((tx) => (
                <View key={tx.id} style={styles.historyItem}>
                  <View style={styles.historyItemLeft}>
                    <Text style={styles.historyLabel}>{tx.label}</Text>
                    <Text style={styles.historyDate}>{formatDate(tx.timestamp)}</Text>
                  </View>
                  <View style={styles.historyItemRight}>
                    <Text style={[
                      styles.historyAmount,
                      tx.amount < 0 ? styles.debit : styles.credit
                    ]}>
                      {tx.amount < 0 ? '-' : '+'} {formatAmount(tx.amount, tx.currency)}
                    </Text>
                    <Text style={styles.historyCategory}>{tx.category}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#3B82F6'
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  loadingText: {
    color: '#fff',
    fontSize: 18
  },
  errorText: {
    color: '#fff',
    fontSize: 18
  },
  scrollContent: {
    paddingBottom: 40
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 16
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff'
  },
  headerIcon: {
    fontSize: 24
  },
  balanceCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    marginHorizontal: 24,
    marginBottom: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5
  },
  balanceLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8
  },
  balanceAmount: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 20
  },
  qrContainer: {
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 16,
    marginTop: 8
  },
  qrCodeWrapper: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12
  },
  qrExpiry: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 12
  },
  hideQrText: {
    fontSize: 14,
    color: '#3B82F6',
    marginTop: 8,
    fontWeight: '600'
  },
  showQrButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 24
  },
  showQrButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600'
  },
  actionsSection: {
    paddingHorizontal: 24,
    marginBottom: 24
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 16
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6
  },
  actionButton: {
    width: '31%',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    margin: 6
  },
  actionEmoji: {
    fontSize: 32,
    marginBottom: 8
  },
  actionLabel: {
    fontSize: 11,
    color: '#fff',
    textAlign: 'center',
    fontWeight: '600'
  },
  billsSection: {
    marginTop: 16
  },
  billsHeader: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  billsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  billsHeaderText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
    marginLeft: 12
  },
  chevron: {
    fontSize: 14,
    color: '#fff'
  },
  subActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    marginHorizontal: -4
  },
  subActionButton: {
    width: '48%',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    margin: 4
  },
  subActionEmoji: {
    fontSize: 20,
    marginRight: 8
  },
  subActionLabel: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '500'
  },
  historySection: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 24,
    minHeight: 300
  },
  emptyHistory: {
    paddingVertical: 60,
    alignItems: 'center'
  },
  emptyHistoryText: {
    fontSize: 14,
    color: '#9CA3AF'
  },
  historyList: {
    paddingBottom: 20
  },
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 16,
    marginBottom: 8
  },
  historyItemLeft: {
    flex: 1
  },
  historyLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4
  },
  historyDate: {
    fontSize: 11,
    color: '#6B7280'
  },
  historyItemRight: {
    alignItems: 'flex-end'
  },
  historyAmount: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4
  },
  debit: {
    color: '#DC2626'
  },
  credit: {
    color: '#059669'
  },
  historyCategory: {
    fontSize: 11,
    color: '#9CA3AF',
    textTransform: 'capitalize'
  },
  scanner: {
    flex: 1,
    backgroundColor: '#000'
  },
  scannerOverlay: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 60
  },
  scannerText: {
    fontSize: 20,
    color: '#fff',
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12
  },
  cancelButton: {
    backgroundColor: '#fff',
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 24
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000'
  }
});
