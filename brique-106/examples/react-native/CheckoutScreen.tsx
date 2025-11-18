/**
 * React Native Example - Molam Form Integration
 *
 * Demonstrates:
 * - Native bridge integration
 * - Event handling
 * - OTP flow
 * - Native payment sheets
 * - Error handling
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import MolamForm from '@molam/form-react-native';
import type { CardDetails, PaymentIntent } from '@molam/form-react-native';

interface CheckoutScreenProps {
  amount: number;
  currency?: string;
  onSuccess?: (paymentIntent: PaymentIntent) => void;
  onCancel?: () => void;
}

export const CheckoutScreen: React.FC<CheckoutScreenProps> = ({
  amount,
  currency = 'USD',
  onSuccess,
  onCancel,
}) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [cardNumber, setCardNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [cvc, setCvc] = useState('');
  const [cardholderName, setCardholderName] = useState('');

  // Initialize SDK
  useEffect(() => {
    const initializeSDK = async () => {
      try {
        await MolamForm.initialize({
          publishableKey: 'pk_test_your_publishable_key_here',
          apiBase: 'https://staging-api.molam.com',
          locale: 'en',
        });

        console.log('[Molam] SDK initialized');
        setIsInitialized(true);

        // Setup event listeners
        setupEventListeners();
      } catch (error) {
        console.error('[Molam] Initialization failed:', error);
        Alert.alert('Error', 'Failed to initialize payment SDK');
      }
    };

    initializeSDK();

    // Cleanup
    return () => {
      MolamForm.removeAllListeners();
    };
  }, []);

  // Setup event listeners
  const setupEventListeners = () => {
    MolamForm.on('paymentSuccess', (data) => {
      console.log('[Molam] Payment successful:', data);
      setIsProcessing(false);
      Alert.alert(
        'Payment Successful',
        'Your payment has been processed successfully!',
        [
          {
            text: 'OK',
            onPress: () => onSuccess?.(data.paymentIntent),
          },
        ]
      );
    });

    MolamForm.on('paymentFailed', (error) => {
      console.error('[Molam] Payment failed:', error);
      setIsProcessing(false);
      Alert.alert('Payment Failed', error.message || 'Payment could not be processed');
    });

    MolamForm.on('paymentCanceled', () => {
      console.log('[Molam] Payment canceled');
      setIsProcessing(false);
      onCancel?.();
    });

    MolamForm.on('tokenCreated', (data) => {
      console.log('[Molam] Token created:', data.token);
    });

    MolamForm.on('otpRequested', (data) => {
      console.log('[Molam] OTP requested:', data);
      setIsProcessing(false);
      promptForOTP();
    });

    MolamForm.on('3dsStarted', (data) => {
      console.log('[Molam] 3DS started:', data);
    });
  };

  // Prompt for OTP input
  const promptForOTP = () => {
    Alert.prompt(
      'OTP Required',
      'Please enter the OTP code sent to your phone:',
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => setIsProcessing(false),
        },
        {
          text: 'Submit',
          onPress: async (otpCode) => {
            if (!otpCode) return;

            setIsProcessing(true);
            try {
              await MolamForm.confirmOtp('pi_current', otpCode);
            } catch (error) {
              console.error('[Molam] OTP confirmation failed:', error);
              Alert.alert('Error', 'Invalid OTP code');
              setIsProcessing(false);
            }
          },
        },
      ],
      'plain-text'
    );
  };

  // Parse expiry date (MM/YY format)
  const parseExpiryDate = (expiry: string): { month: number; year: number } => {
    const parts = expiry.split('/');
    return {
      month: parseInt(parts[0], 10),
      year: 2000 + parseInt(parts[1], 10),
    };
  };

  // Handle manual card payment
  const handleCardPayment = async () => {
    if (!cardNumber || !expiryDate || !cvc || !cardholderName) {
      Alert.alert('Error', 'Please fill in all card details');
      return;
    }

    setIsProcessing(true);

    try {
      const { month, year } = parseExpiryDate(expiryDate);

      // Create token
      const token = await MolamForm.createToken({
        cardNumber: cardNumber.replace(/\s/g, ''),
        expMonth: month,
        expYear: year,
        cvc,
        cardholderName,
      });

      console.log('[Molam] Token created:', token);

      // Create payment intent on your backend
      const paymentIntent = await createPaymentIntent(token.id);

      // Confirm payment
      const result = await MolamForm.confirmPayment(
        paymentIntent.id,
        paymentIntent.client_secret
      );

      if (result.status === 'succeeded') {
        setIsProcessing(false);
        Alert.alert('Success', 'Payment successful!');
        onSuccess?.(result);
      }
    } catch (error: any) {
      console.error('[Molam] Payment error:', error);
      setIsProcessing(false);
      Alert.alert('Error', error.message || 'Payment failed');
    }
  };

  // Handle native payment sheet
  const handleNativePaymentSheet = async () => {
    setIsProcessing(true);

    try {
      // Get client secret from your backend
      const { client_secret } = await createPaymentIntent();

      // Present native payment sheet
      const result = await MolamForm.presentPaymentSheet(client_secret);

      setIsProcessing(false);

      if (result.status === 'succeeded') {
        Alert.alert('Success', 'Payment successful!');
        onSuccess?.(result);
      }
    } catch (error: any) {
      console.error('[Molam] Payment sheet error:', error);
      setIsProcessing(false);
      Alert.alert('Error', error.message || 'Payment failed');
    }
  };

  // Handle native card form
  const handleNativeCardForm = async () => {
    try {
      setIsProcessing(true);

      // Present native card form
      const token = await MolamForm.presentCardForm();

      console.log('[Molam] Token from native form:', token);

      // Create and confirm payment
      const paymentIntent = await createPaymentIntent(token.id);
      const result = await MolamForm.confirmPayment(
        paymentIntent.id,
        paymentIntent.client_secret
      );

      setIsProcessing(false);

      if (result.status === 'succeeded') {
        Alert.alert('Success', 'Payment successful!');
        onSuccess?.(result);
      }
    } catch (error: any) {
      console.error('[Molam] Native form error:', error);
      setIsProcessing(false);
      Alert.alert('Error', error.message || 'Payment canceled');
    }
  };

  // Create payment intent on backend
  const createPaymentIntent = async (tokenId?: string): Promise<any> => {
    const response = await fetch('https://your-backend.com/api/payment-intents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token: tokenId,
        amount,
        currency,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to create payment intent');
    }

    return response.json();
  };

  // Format card number with spaces
  const formatCardNumber = (text: string) => {
    const cleaned = text.replace(/\s/g, '');
    const formatted = cleaned.match(/.{1,4}/g)?.join(' ') || cleaned;
    setCardNumber(formatted);
  };

  // Format expiry date (MM/YY)
  const formatExpiryDate = (text: string) => {
    const cleaned = text.replace(/\D/g, '');
    if (cleaned.length >= 2) {
      setExpiryDate(`${cleaned.slice(0, 2)}/${cleaned.slice(2, 4)}`);
    } else {
      setExpiryDate(cleaned);
    }
  };

  if (!isInitialized) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#667eea" />
        <Text style={styles.loadingText}>Initializing payment...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Checkout</Text>
          <Text style={styles.amount}>{formatAmount(amount, currency)}</Text>
        </View>

        {/* Manual Card Entry */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Card Details</Text>

          <TextInput
            style={styles.input}
            placeholder="Card Number"
            value={cardNumber}
            onChangeText={formatCardNumber}
            keyboardType="number-pad"
            maxLength={19}
            editable={!isProcessing}
          />

          <View style={styles.row}>
            <TextInput
              style={[styles.input, styles.halfInput]}
              placeholder="MM/YY"
              value={expiryDate}
              onChangeText={formatExpiryDate}
              keyboardType="number-pad"
              maxLength={5}
              editable={!isProcessing}
            />
            <TextInput
              style={[styles.input, styles.halfInput]}
              placeholder="CVC"
              value={cvc}
              onChangeText={setCvc}
              keyboardType="number-pad"
              maxLength={4}
              secureTextEntry
              editable={!isProcessing}
            />
          </View>

          <TextInput
            style={styles.input}
            placeholder="Cardholder Name"
            value={cardholderName}
            onChangeText={setCardholderName}
            autoCapitalize="words"
            editable={!isProcessing}
          />

          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={handleCardPayment}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Pay {formatAmount(amount, currency)}</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Native Payment Options */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Or use native forms</Text>

          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={handleNativePaymentSheet}
            disabled={isProcessing}
          >
            <Text style={styles.secondaryButtonText}>Payment Sheet</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={handleNativeCardForm}
            disabled={isProcessing}
          >
            <Text style={styles.secondaryButtonText}>Native Card Form</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

// Format amount with currency
function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount / 100);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f7',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#86868b',
  },
  scrollContent: {
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
    paddingTop: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    color: '#1d1d1f',
    marginBottom: 8,
  },
  amount: {
    fontSize: 36,
    fontWeight: '700',
    color: '#667eea',
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1d1d1f',
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#f5f5f7',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#d2d2d7',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfInput: {
    flex: 1,
  },
  button: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButton: {
    backgroundColor: '#667eea',
  },
  secondaryButton: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#667eea',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButtonText: {
    color: '#667eea',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default CheckoutScreen;
