import React, { useState, useEffect, KeyboardEvent } from 'react';

interface QRData {
  id: string;
  qr_data_url: string;
  url: string;
  expires_at: string;
  hmac: string;
  amount?: number;
  currency?: string;
  type: string;
  status?: string;
}

interface QRSession {
  id: string;
  type: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
}

interface USSDTransaction {
  type: string;
  amount?: number;
  currency?: string;
  status: string;
  created_at: string;
}

const OfflinePayments: React.FC = () => {
  // QR Code state
  const [qrType, setQrType] = useState('payment_request');
  const [qrAmount, setQrAmount] = useState('5000');
  const [qrCurrency, setQrCurrency] = useState('XOF');
  const [qrTTL, setQrTTL] = useState('300');
  const [currentQR, setCurrentQR] = useState<QRData | null>(null);
  const [qrMessage, setQrMessage] = useState<{ text: string; type: string } | null>(null);
  const [qrResult, setQrResult] = useState<any>(null);
  const [qrSessions, setQrSessions] = useState<QRSession[]>([]);

  // USSD state
  const [ussdPhone, setUssdPhone] = useState('+221771234567');
  const [ussdCountry, setUssdCountry] = useState('SN');
  const [ussdSessionId, setUssdSessionId] = useState<string | null>(null);
  const [ussdText, setUssdText] = useState('');
  const [ussdOutput, setUssdOutput] = useState('');
  const [ussdInput, setUssdInput] = useState('');
  const [ussdActive, setUssdActive] = useState(false);
  const [ussdEnded, setUssdEnded] = useState(false);
  const [ussdMessage, setUssdMessage] = useState<{ text: string; type: string } | null>(null);
  const [ussdTransactions, setUssdTransactions] = useState<USSDTransaction[]>([]);

  // QR Code Functions
  const generateQR = async () => {
    showQRMessage('Generating QR code...', 'info');

    try {
      const response = await fetch('/api/v1/qr/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: qrType,
          amount: parseFloat(qrAmount),
          currency: qrCurrency,
          ttl: parseInt(qrTTL)
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate QR code');
      }

      const data = await response.json();
      setCurrentQR(data);
      showQRMessage('✅ QR code generated successfully!', 'success');
      setQrResult(data);
    } catch (error: any) {
      showQRMessage(`❌ Error: ${error.message}`, 'error');
    }
  };

  const verifyCurrentQR = async () => {
    if (!currentQR) {
      showQRMessage('No QR code to verify', 'error');
      return;
    }

    try {
      const response = await fetch(`/api/v1/qr/verify/${currentQR.id}?hmac=${currentQR.hmac}`);

      if (!response.ok) {
        throw new Error('QR verification failed');
      }

      const data = await response.json();
      showQRMessage(`✅ QR code is valid! Status: ${data.status}`, 'success');
      setQrResult(data);
    } catch (error: any) {
      showQRMessage(`❌ Error: ${error.message}`, 'error');
    }
  };

  const loadQRSessions = async () => {
    try {
      const response = await fetch('/api/v1/qr/sessions?limit=10');
      const sessions = await response.json();
      setQrSessions(sessions);
    } catch (error) {
      console.error('Error loading QR sessions:', error);
    }
  };

  // USSD Functions
  const startUSSD = async () => {
    const sessionId = 'test_' + Date.now();
    setUssdSessionId(sessionId);
    setUssdText('');
    setUssdOutput('Connecting to USSD gateway...\n');
    setUssdActive(true);
    setUssdEnded(false);

    try {
      const response = await fetch('/api/v1/ussd/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          msisdn: ussdPhone,
          text: '',
          countryCode: ussdCountry
        })
      });

      const data = await response.json();
      setUssdOutput(prev => prev + '\n' + data.text + '\n');
      setUssdEnded(data.end);

      if (data.end) {
        setUssdOutput(prev => prev + '\n[Session ended. Press "Dial *131#" to start again]');
      }
    } catch (error: any) {
      showUSSDMessage(`❌ Error: ${error.message}`, 'error');
    }
  };

  const handleUSSDInput = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !ussdEnded) {
      const userInput = ussdInput.trim();
      if (!userInput) return;

      const newText = ussdText ? `${ussdText}*${userInput}` : userInput;
      setUssdText(newText);
      setUssdInput('');

      try {
        const response = await fetch('/api/v1/ussd/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: ussdSessionId,
            msisdn: ussdPhone,
            text: newText,
            countryCode: ussdCountry
          })
        });

        const data = await response.json();
        setUssdOutput(prev => prev + '\n' + data.text + '\n');
        setUssdEnded(data.end);

        if (data.end) {
          setUssdOutput(prev => prev + '\n[Session ended. Press "Dial *131#" to start again]');
        }
      } catch (error: any) {
        setUssdOutput(prev => prev + `\nERROR: ${error.message}`);
        setUssdEnded(true);
      }
    }
  };

  const resetUSSD = () => {
    setUssdActive(false);
    setUssdOutput('');
    setUssdInput('');
    setUssdSessionId(null);
    setUssdText('');
    setUssdEnded(false);
  };

  const loadUSSDTransactions = async () => {
    try {
      const response = await fetch(`/api/v1/ussd/transactions?phone=${ussdPhone}&limit=10`);
      const transactions = await response.json();
      setUssdTransactions(transactions);
    } catch (error) {
      console.error('Error loading USSD transactions:', error);
    }
  };

  // Utility Functions
  const showQRMessage = (text: string, type: string) => {
    setQrMessage({ text, type });
    setTimeout(() => setQrMessage(null), 5000);
  };

  const showUSSDMessage = (text: string, type: string) => {
    setUssdMessage({ text, type });
    setTimeout(() => setUssdMessage(null), 5000);
  };

  const getStatusColor = (status: string) => {
    const colors: { [key: string]: string } = {
      pending: 'bg-yellow-500',
      completed: 'bg-green-500',
      failed: 'bg-red-500',
      expired: 'bg-red-500',
      cancelled: 'bg-red-500',
      scanned: 'bg-blue-500'
    };
    return colors[status] || 'bg-blue-500';
  };

  useEffect(() => {
    loadQRSessions();
    loadUSSDTransactions();
  }, []);

  return (
    <div className="min-h-screen p-5" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl p-6 mb-6 shadow-xl">
          <a href="/dashboard" className="inline-block mb-4 text-indigo-600 text-sm hover:underline">
            ← Back to Dashboard
          </a>
          <h1 className="text-3xl font-semibold text-gray-800 mb-2">🔌 Offline Payment Tests</h1>
          <p className="text-gray-600 text-sm">Test QR Codes and USSD menus for offline payment scenarios</p>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* QR Code Section */}
          <div className="bg-white rounded-2xl p-6 shadow-xl">
            <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
              📱 QR Code Generation
            </h2>

            <div className="mb-4">
              <label className="block mb-2 text-sm font-medium text-gray-700">Type</label>
              <select
                value={qrType}
                onChange={(e) => setQrType(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
              >
                <option value="payment_request">Payment Request</option>
                <option value="cash_in">Cash In</option>
                <option value="agent_receipt">Agent Receipt</option>
                <option value="withdrawal">Withdrawal</option>
              </select>
            </div>

            <div className="mb-4">
              <label className="block mb-2 text-sm font-medium text-gray-700">Amount (XOF)</label>
              <input
                type="number"
                value={qrAmount}
                onChange={(e) => setQrAmount(e.target.value)}
                min="0"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
              />
            </div>

            <div className="mb-4">
              <label className="block mb-2 text-sm font-medium text-gray-700">Currency</label>
              <select
                value={qrCurrency}
                onChange={(e) => setQrCurrency(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
              >
                <option value="XOF">XOF - West African CFA</option>
                <option value="USD">USD - US Dollar</option>
                <option value="EUR">EUR - Euro</option>
              </select>
            </div>

            <div className="mb-4">
              <label className="block mb-2 text-sm font-medium text-gray-700">Expiration (seconds)</label>
              <input
                type="number"
                value={qrTTL}
                onChange={(e) => setQrTTL(e.target.value)}
                min="60"
                max="3600"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
              />
              <small className="block mt-1 text-xs text-gray-500">How long the QR code is valid</small>
            </div>

            <button
              onClick={generateQR}
              className="w-full py-3 text-white font-semibold rounded-lg transition-all hover:shadow-lg hover:-translate-y-0.5"
              style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
            >
              Generate QR Code
            </button>

            {currentQR && (
              <div className="mt-4 p-5 bg-gray-100 rounded-lg text-center">
                <img src={currentQR.qr_data_url} alt="QR Code" className="max-w-xs w-full mx-auto border-4 border-white shadow-lg" />
                <div className="mt-3 text-xs text-gray-600">
                  <div><strong>ID:</strong> {currentQR.id}</div>
                  <div><strong>Expires:</strong> {new Date(currentQR.expires_at).toLocaleString()}</div>
                  <div><strong>Amount:</strong> {qrAmount} {qrCurrency}</div>
                </div>
                <div className="mt-2 p-2 bg-white rounded text-xs font-mono break-all">{currentQR.url}</div>
                <button
                  onClick={verifyCurrentQR}
                  className="mt-3 px-4 py-2 bg-gray-600 text-white text-sm font-semibold rounded-lg hover:bg-gray-700"
                >
                  Verify QR
                </button>
              </div>
            )}

            {qrMessage && (
              <div
                className={`mt-3 p-3 rounded-lg text-sm ${
                  qrMessage.type === 'success'
                    ? 'bg-green-100 text-green-700 border border-green-300'
                    : qrMessage.type === 'error'
                    ? 'bg-red-100 text-red-700 border border-red-300'
                    : 'bg-blue-100 text-blue-700 border border-blue-300'
                }`}
              >
                {qrMessage.text}
              </div>
            )}

            {qrResult && (
              <div className="mt-3 p-3 bg-gray-100 rounded-lg max-h-96 overflow-y-auto text-xs">
                <pre className="whitespace-pre-wrap">{JSON.stringify(qrResult, null, 2)}</pre>
              </div>
            )}
          </div>

          {/* USSD Section */}
          <div className="bg-white rounded-2xl p-6 shadow-xl">
            <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
              ☎️ USSD Menu Simulator
            </h2>

            <div className="mb-4">
              <label className="block mb-2 text-sm font-medium text-gray-700">Phone Number</label>
              <input
                type="text"
                value={ussdPhone}
                onChange={(e) => setUssdPhone(e.target.value)}
                placeholder="+221771234567"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
              />
              <small className="block mt-1 text-xs text-gray-500">Senegal format: +221XXXXXXXXX</small>
            </div>

            <div className="mb-4">
              <label className="block mb-2 text-sm font-medium text-gray-700">Country</label>
              <select
                value={ussdCountry}
                onChange={(e) => setUssdCountry(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
              >
                <option value="SN">SN - Senegal</option>
                <option value="CI">CI - Côte d'Ivoire</option>
                <option value="ML">ML - Mali</option>
                <option value="BF">BF - Burkina Faso</option>
              </select>
            </div>

            <button
              onClick={startUSSD}
              className="w-full py-3 mb-2 text-white font-semibold rounded-lg transition-all hover:shadow-lg hover:-translate-y-0.5"
              style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
            >
              Dial *131#
            </button>
            <button
              onClick={resetUSSD}
              className="w-full py-3 bg-gray-600 text-white font-semibold rounded-lg hover:bg-gray-700"
            >
              Reset Session
            </button>

            {ussdActive && (
              <div className="mt-4 bg-black text-white p-5 rounded-lg font-mono text-sm min-h-52">
                <div className="whitespace-pre-wrap mb-3">{ussdOutput}</div>
                <div className="flex gap-2 items-center">
                  <span className="text-green-400">&gt;</span>
                  <input
                    type="text"
                    value={ussdInput}
                    onChange={(e) => setUssdInput(e.target.value)}
                    onKeyPress={handleUSSDInput}
                    disabled={ussdEnded}
                    placeholder="Enter your choice..."
                    className="flex-1 bg-transparent border-0 border-b border-green-400 text-green-400 font-mono text-sm outline-none"
                  />
                </div>
              </div>
            )}

            {ussdMessage && (
              <div
                className={`mt-3 p-3 rounded-lg text-sm ${
                  ussdMessage.type === 'success'
                    ? 'bg-green-100 text-green-700 border border-green-300'
                    : ussdMessage.type === 'error'
                    ? 'bg-red-100 text-red-700 border border-red-300'
                    : 'bg-blue-100 text-blue-700 border border-blue-300'
                }`}
              >
                {ussdMessage.text}
              </div>
            )}
          </div>
        </div>

        {/* QR Sessions List */}
        <div className="bg-white rounded-2xl p-6 shadow-xl mb-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">📊 Recent QR Sessions</h2>
          <button
            onClick={loadQRSessions}
            className="mb-3 px-4 py-2 text-white font-semibold rounded-lg"
            style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
          >
            Refresh List
          </button>
          <div className="max-h-96 overflow-y-auto">
            {qrSessions.length === 0 ? (
              <p className="text-gray-500">No QR sessions found</p>
            ) : (
              qrSessions.map((s) => (
                <div key={s.id} className="p-3 bg-gray-50 rounded-lg mb-2">
                  <div className="text-sm"><strong>ID:</strong> {s.id}</div>
                  <div className="text-sm"><strong>Type:</strong> {s.type}</div>
                  <div className="text-sm"><strong>Amount:</strong> {s.amount} {s.currency}</div>
                  <div className="text-sm">
                    <strong>Status:</strong>{' '}
                    <span className={`inline-block px-2 py-1 text-xs font-semibold text-white rounded ${getStatusColor(s.status)}`}>
                      {s.status}
                    </span>
                  </div>
                  <div className="text-sm"><strong>Created:</strong> {new Date(s.created_at).toLocaleString()}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* USSD Transactions List */}
        <div className="bg-white rounded-2xl p-6 shadow-xl">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">📊 USSD Transactions</h2>
          <button
            onClick={loadUSSDTransactions}
            className="mb-3 px-4 py-2 text-white font-semibold rounded-lg"
            style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
          >
            Refresh List
          </button>
          <div className="max-h-96 overflow-y-auto">
            {ussdTransactions.length === 0 ? (
              <p className="text-gray-500">No transactions found</p>
            ) : (
              ussdTransactions.map((t, i) => (
                <div key={i} className="p-3 bg-gray-50 rounded-lg mb-2">
                  <div className="text-sm"><strong>Type:</strong> {t.type}</div>
                  <div className="text-sm"><strong>Amount:</strong> {t.amount || 'N/A'} {t.currency || ''}</div>
                  <div className="text-sm">
                    <strong>Status:</strong>{' '}
                    <span className={`inline-block px-2 py-1 text-xs font-semibold text-white rounded ${getStatusColor(t.status)}`}>
                      {t.status}
                    </span>
                  </div>
                  <div className="text-sm"><strong>Created:</strong> {new Date(t.created_at).toLocaleString()}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OfflinePayments;