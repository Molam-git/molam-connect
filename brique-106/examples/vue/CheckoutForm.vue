<template>
  <div class="checkout-form">
    <form @submit.prevent="handleSubmit">
      <!-- Molam Form Container -->
      <div ref="formRef" class="molam-form-wrapper"></div>

      <!-- Error Message -->
      <div v-if="errorMessage" class="alert alert-error" role="alert">
        {{ errorMessage }}
      </div>

      <!-- Success Message -->
      <div v-if="successMessage" class="alert alert-success" role="alert">
        {{ successMessage }}
      </div>

      <!-- Submit Button -->
      <button
        type="submit"
        class="submit-button"
        :disabled="!isReady || isProcessing"
      >
        {{ isProcessing ? 'Processing...' : `Pay ${formattedAmount}` }}
      </button>
    </form>
  </div>
</template>

<script setup lang="ts">
/**
 * Vue 3 Example - Molam Form Integration
 *
 * Demonstrates:
 * - Composition API
 * - TypeScript support
 * - Reactive state management
 * - Event handling
 * - Lifecycle hooks
 */

import { ref, computed, onMounted, onUnmounted } from 'vue';
import MolamForm from '@molam/form-web';
import type { Token, PaymentIntent, MolamFormEvent } from '@molam/form-web';

interface Props {
  publishableKey: string;
  amount: number;
  currency?: string;
}

interface Emits {
  (e: 'success', paymentIntent: PaymentIntent): void;
  (e: 'error', error: Error): void;
}

const props = withDefaults(defineProps<Props>(), {
  currency: 'USD',
});

const emit = defineEmits<Emits>();

// Refs
const formRef = ref<HTMLDivElement | null>(null);
let molamInstance: MolamForm | null = null;

// State
const isReady = ref(false);
const isProcessing = ref(false);
const errorMessage = ref<string | null>(null);
const successMessage = ref<string | null>(null);

// Computed
const formattedAmount = computed(() => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: props.currency,
  }).format(props.amount / 100);
});

// Initialize Molam Form
onMounted(() => {
  if (!formRef.value) return;

  const molam = new MolamForm({
    publishableKey: props.publishableKey,
    apiBase: import.meta.env.VITE_MOLAM_API_BASE || 'https://api.molam.com',
    locale: navigator.language.split('-')[0] || 'en',
    theme: 'minimal',
  });

  // Mount form
  molam.mount(formRef.value);

  // Event listeners
  molam.on('ready', () => {
    console.log('[Molam] Form ready');
    isReady.value = true;
  });

  molam.on('change', (event: MolamFormEvent) => {
    console.log('[Molam] Field changed:', event);
    errorMessage.value = null;
  });

  molam.on('tokenization:start', () => {
    console.log('[Molam] Tokenization started');
    isProcessing.value = true;
    errorMessage.value = null;
    successMessage.value = null;
  });

  molam.on('tokenization:success', async (data) => {
    console.log('[Molam] Token created:', data.token);

    try {
      // Create payment intent on backend
      const paymentIntent = await createPaymentIntent(data.token);

      // Confirm payment
      const result = await molam.confirmPayment(
        paymentIntent.id,
        paymentIntent.client_secret
      );

      if (result.status === 'succeeded') {
        successMessage.value = 'Payment successful!';
        emit('success', result);
      }
    } catch (error) {
      const err = error as Error;
      errorMessage.value = err.message;
      emit('error', err);
    } finally {
      isProcessing.value = false;
    }
  });

  molam.on('tokenization:error', (error) => {
    console.error('[Molam] Tokenization failed:', error);
    errorMessage.value = error.message || 'Failed to process card';
    isProcessing.value = false;
    emit('error', new Error(error.message));
  });

  molam.on('payment:success', (data) => {
    console.log('[Molam] Payment successful:', data);
    successMessage.value = 'Payment completed successfully!';
    isProcessing.value = false;
    emit('success', data.paymentIntent);
  });

  molam.on('payment:failed', (error) => {
    console.error('[Molam] Payment failed:', error);
    errorMessage.value = error.message || 'Payment failed';
    isProcessing.value = false;
    emit('error', new Error(error.message));
  });

  molam.on('3ds:start', (data) => {
    console.log('[Molam] 3DS authentication started:', data);
    successMessage.value = 'Redirecting to 3D Secure authentication...';
  });

  molam.on('otp:requested', async (data) => {
    console.log('[Molam] OTP requested:', data);

    // Show custom OTP modal or use browser prompt
    const otpCode = prompt('Enter the OTP code sent to your phone:');

    if (otpCode) {
      try {
        await molam.confirmOtp(otpCode);
      } catch (error) {
        console.error('[Molam] OTP confirmation failed:', error);
        errorMessage.value = 'Invalid OTP code';
      }
    } else {
      errorMessage.value = 'OTP is required to complete payment';
      isProcessing.value = false;
    }
  });

  molamInstance = molam;
});

// Cleanup
onUnmounted(() => {
  if (molamInstance) {
    molamInstance.unmount();
    molamInstance = null;
  }
});

// Create payment intent on backend
async function createPaymentIntent(token: Token): Promise<PaymentIntent> {
  const response = await fetch('/api/payment-intents', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      token: token.id,
      amount: props.amount,
      currency: props.currency,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to create payment intent');
  }

  return response.json();
}

// Handle payment submission
async function handleSubmit() {
  if (!molamInstance || !isReady.value || isProcessing.value) {
    return;
  }

  errorMessage.value = null;
  successMessage.value = null;

  try {
    await molamInstance.createToken();
    // SDK will handle the rest via events
  } catch (error) {
    const err = error as Error;
    console.error('[Molam] Payment error:', err);
    errorMessage.value = err.message;
    isProcessing.value = false;
  }
}
</script>

<style scoped>
.checkout-form {
  max-width: 500px;
  margin: 0 auto;
  padding: 24px;
}

.molam-form-wrapper {
  margin-bottom: 24px;
}

.alert {
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 16px;
  font-size: 14px;
}

.alert-error {
  background: rgba(255, 59, 48, 0.1);
  color: #ff3b30;
  border: 1px solid #ff3b30;
}

.alert-success {
  background: rgba(52, 199, 89, 0.1);
  color: #34c759;
  border: 1px solid #34c759;
}

.submit-button {
  width: 100%;
  padding: 16px;
  font-size: 16px;
  font-weight: 600;
  color: white;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.submit-button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 16px rgba(102, 126, 234, 0.3);
}

.submit-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}
</style>
