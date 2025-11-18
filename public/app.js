/**
 * Molam Connect Dashboard - App Logic
 */

const API_BASE = '/api/v1';

// ============================================================================
// Tab Management
// ============================================================================

function showTab(tabName) {
  // Hide all tabs
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.remove('active');
  });

  // Remove active class from all tab buttons
  document.querySelectorAll('.tab').forEach(btn => {
    btn.classList.remove('active');
  });

  // Show selected tab
  document.getElementById(`tab-${tabName}`).classList.add('active');

  // Set active tab button
  event.target.classList.add('active');
}

// ============================================================================
// Server Status Check
// ============================================================================

async function checkServerStatus() {
  try {
    const response = await fetch('/health');
    const data = await response.json();

    const statusElement = document.getElementById('serverStatus');

    if (data.status === 'healthy') {
      statusElement.innerHTML = '<span class="status-dot"></span> Server Online';
      statusElement.classList.remove('offline');
      addLog('System', 'Server status: Online', 'success');
    } else {
      statusElement.innerHTML = '<span class="status-dot"></span> Server Issues';
      statusElement.classList.add('offline');
      addLog('System', 'Server status: Issues detected', 'error');
    }
  } catch (error) {
    const statusElement = document.getElementById('serverStatus');
    statusElement.innerHTML = '<span class="status-dot"></span> Server Offline';
    statusElement.classList.add('offline');
    addLog('System', `Server status check failed: ${error.message}`, 'error');
  }
}

// Check status on load and every 30 seconds
checkServerStatus();
setInterval(checkServerStatus, 30000);

// ============================================================================
// Logging
// ============================================================================

function addLog(source, message, type = 'info') {
  const logsContainer = document.getElementById('logs');
  const timestamp = new Date().toLocaleTimeString();

  const logEntry = document.createElement('div');
  logEntry.className = `log-entry ${type}`;
  logEntry.innerHTML = `
    <span class="log-time">${timestamp} [${source}]</span>
    <span class="log-message">${message}</span>
  `;

  logsContainer.appendChild(logEntry);
  logsContainer.scrollTop = logsContainer.scrollHeight;
}

function clearLogs() {
  const logsContainer = document.getElementById('logs');
  logsContainer.innerHTML = `
    <div class="log-entry">
      <span class="log-time">System</span>
      <span class="log-message">Logs cleared</span>
    </div>
  `;
}

// ============================================================================
// API Helpers
// ============================================================================

async function apiRequest(method, endpoint, body = null) {
  try {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${API_BASE}${endpoint}`, options);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Request failed');
    }

    return data;
  } catch (error) {
    throw error;
  }
}

function displayResult(elementId, data, isError = false) {
  const element = document.getElementById(elementId);
  element.style.display = 'block';
  element.className = `result-box ${isError ? 'error' : 'success'}`;

  element.innerHTML = `
    <div class="result-label">${isError ? 'Error' : 'Success'}</div>
    <pre>${JSON.stringify(data, null, 2)}</pre>
  `;
}

// ============================================================================
// Payment Intent Functions
// ============================================================================

async function createPaymentIntent() {
  const amount = parseInt(document.getElementById('pi_amount').value);
  const currency = document.getElementById('pi_currency').value;
  const description = document.getElementById('pi_description').value;

  if (!amount || amount <= 0) {
    displayResult('pi_result', { error: 'Invalid amount' }, true);
    addLog('Payment', 'Payment intent creation failed: Invalid amount', 'error');
    return;
  }

  try {
    addLog('Payment', `Creating payment intent: ${amount} ${currency}...`);

    const data = await apiRequest('POST', '/payment_intents', {
      amount,
      currency,
      description: description || null,
    });

    displayResult('pi_result', data, false);
    addLog('Payment', `Payment intent created: ${data.id}`, 'success');

    // Populate confirm section
    document.getElementById('pi_id_confirm').value = data.id;
    document.getElementById('pi_secret_confirm').value = data.client_secret;
    document.getElementById('confirm_section').style.display = 'block';
  } catch (error) {
    displayResult('pi_result', { error: error.message }, true);
    addLog('Payment', `Payment intent creation failed: ${error.message}`, 'error');
  }
}

async function confirmPaymentIntent() {
  const id = document.getElementById('pi_id_confirm').value;
  const clientSecret = document.getElementById('pi_secret_confirm').value;
  const paymentMethod = document.getElementById('pi_payment_method').value;

  if (!id || !clientSecret) {
    alert('Please create a payment intent first');
    return;
  }

  try {
    addLog('Payment', `Confirming payment intent: ${id}...`);

    const data = await apiRequest('POST', `/payment_intents/${id}/confirm`, {
      client_secret: clientSecret,
      payment_method: paymentMethod,
    });

    displayResult('pi_result', data, false);
    addLog('Payment', `Payment confirmed: ${data.id} - Status: ${data.status}`, 'success');
  } catch (error) {
    displayResult('pi_result', { error: error.message }, true);
    addLog('Payment', `Payment confirmation failed: ${error.message}`, 'error');
  }
}

// ============================================================================
// Auth Decision Functions
// ============================================================================

async function makeAuthDecision() {
  const amount = parseInt(document.getElementById('auth_amount').value);
  const currency = document.getElementById('auth_currency').value;
  const country = document.getElementById('auth_country').value;
  const bin = document.getElementById('auth_bin').value;
  const deviceFp = document.getElementById('auth_device_fp').value;

  try {
    addLog('Auth', `Making auth decision for ${amount} ${currency} in ${country}...`);

    const data = await apiRequest('POST', '/auth/decide', {
      payment_id: 'pi_' + Math.random().toString(36).substr(2, 9),
      amount,
      currency,
      country,
      bin: bin || null,
      device: {
        fingerprint: deviceFp || null,
        ip: '192.168.1.1',
        ua: navigator.userAgent,
      },
    });

    displayResult('auth_result', data, false);
    addLog('Auth', `Auth decision: ${data.recommended} (risk: ${data.risk_score})`, 'success');
  } catch (error) {
    displayResult('auth_result', { error: error.message }, true);
    addLog('Auth', `Auth decision failed: ${error.message}`, 'error');
  }
}

// ============================================================================
// OTP Functions
// ============================================================================

async function createOTP() {
  const phone = document.getElementById('otp_phone').value;
  const method = document.getElementById('otp_method').value;

  if (!phone) {
    displayResult('otp_create_result', { error: 'Phone number required' }, true);
    addLog('OTP', 'OTP creation failed: Phone number required', 'error');
    return;
  }

  try {
    addLog('OTP', `Creating OTP for ${phone} via ${method}...`);

    const data = await apiRequest('POST', '/otp/create', {
      phone,
      method,
      payment_id: 'pi_' + Math.random().toString(36).substr(2, 9),
    });

    displayResult('otp_create_result', data, false);
    addLog('OTP', `OTP created: ${data.otp_id} - Check console for code`, 'success');

    // Populate verify section
    document.getElementById('otp_id_verify').value = data.otp_id;

    // In development, the OTP code is logged to server console
    alert('OTP sent! Check the server console for the code (dev mode).');
  } catch (error) {
    displayResult('otp_create_result', { error: error.message }, true);
    addLog('OTP', `OTP creation failed: ${error.message}`, 'error');
  }
}

async function verifyOTP() {
  const otpId = document.getElementById('otp_id_verify').value;
  const code = document.getElementById('otp_code').value;

  if (!otpId) {
    alert('Please create an OTP first');
    return;
  }

  if (!code || code.length !== 6) {
    displayResult('otp_verify_result', { error: 'Invalid OTP code' }, true);
    addLog('OTP', 'OTP verification failed: Invalid code format', 'error');
    return;
  }

  try {
    addLog('OTP', `Verifying OTP: ${otpId}...`);

    const data = await apiRequest('POST', '/otp/verify', {
      otp_id: otpId,
      code,
    });

    displayResult('otp_verify_result', data, false);

    if (data.success) {
      addLog('OTP', 'OTP verified successfully ✓', 'success');
    } else {
      addLog('OTP', `OTP verification failed: ${data.message}`, 'error');
    }
  } catch (error) {
    displayResult('otp_verify_result', { error: error.message }, true);
    addLog('OTP', `OTP verification error: ${error.message}`, 'error');
  }
}

// ============================================================================
// Customer Functions
// ============================================================================

async function createCustomer() {
  const email = document.getElementById('cust_email').value;
  const name = document.getElementById('cust_name').value;
  const phone = document.getElementById('cust_phone').value;
  const country = document.getElementById('cust_country').value;

  if (!email) {
    displayResult('cust_result', { error: 'Email required' }, true);
    addLog('Customer', 'Customer creation failed: Email required', 'error');
    return;
  }

  try {
    addLog('Customer', `Creating customer: ${email}...`);

    const data = await apiRequest('POST', '/customers', {
      email,
      name: name || null,
      phone: phone || null,
      country: country || null,
    });

    displayResult('cust_result', data, false);
    addLog('Customer', `Customer created: ${data.id} (${data.email})`, 'success');
  } catch (error) {
    displayResult('cust_result', { error: error.message }, true);
    addLog('Customer', `Customer creation failed: ${error.message}`, 'error');
  }
}

// ============================================================================
// Initialize
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  console.log('%c🚀 Molam Connect Dashboard Loaded', 'color: #667eea; font-size: 20px; font-weight: bold;');
  console.log('%cTest all APIs from the dashboard UI', 'color: #6e6e73; font-size: 14px;');
  console.log('%cOTP codes will be logged here in development mode', 'color: #ff9500; font-size: 14px;');

  addLog('System', 'Dashboard initialized successfully');
});
