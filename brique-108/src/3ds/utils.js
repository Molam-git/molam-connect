// src/3ds/utils.js
// 3D Secure 2.0 utilities

/**
 * Check if payment method is a card
 * @param {Object} payment_method - Payment method object
 * @returns {boolean} True if card
 */
function isCard(payment_method) {
  return payment_method && payment_method.type === 'card';
}

/**
 * Start 3DS2 authentication session
 * @param {Object} payment_method - Card payment method
 * @param {Object} payment_intent - PaymentIntent object
 * @returns {Promise<Object>} 3DS session data for client SDK
 */
async function start3DS2Session(payment_method, payment_intent) {
  // Determine card brand and DS provider
  const brand = payment_method.brand || payment_method.card_brand || 'visa';
  const dsProvider = getDSProvider(brand);

  // Generate 3DS transaction ID
  const threeDSServerTransID = `3ds_${require('crypto').randomBytes(16).toString('hex')}`;

  // Mock ACS URL (in production, this comes from directory server lookup)
  const acsUrl = `https://acs.${dsProvider.toLowerCase()}.com/3ds2/challenge`;

  // Build client data for SDK
  const clientData = {
    threeDSServerTransID,
    acsTransID: `acs_${require('crypto').randomBytes(16).toString('hex')}`,
    acsURL: acsUrl,
    challengeWindowSize: '05', // Full page
    messageVersion: '2.2.0',
    transStatus: 'C', // Challenge required
    // Client should submit this to ACS
    creq: generateCReq(payment_method, payment_intent, threeDSServerTransID)
  };

  return {
    provider: dsProvider,
    version: '2.2.0',
    client_data: clientData,
    acs_url: acsUrl
  };
}

/**
 * Get Directory Server provider for card brand
 * @param {string} brand - Card brand
 * @returns {string} DS provider
 */
function getDSProvider(brand) {
  const providers = {
    'visa': 'Visa',
    'mastercard': 'Mastercard',
    'amex': 'AmericanExpress',
    'discover': 'Discover',
    'jcb': 'JCB'
  };

  return providers[brand.toLowerCase()] || 'Visa';
}

/**
 * Generate Challenge Request (CReq) for ACS
 * @param {Object} payment_method - Card details
 * @param {Object} payment_intent - PaymentIntent
 * @param {string} transID - Transaction ID
 * @returns {string} Base64-encoded CReq
 */
function generateCReq(payment_method, payment_intent, transID) {
  const creqPayload = {
    threeDSServerTransID: transID,
    messageType: 'CReq',
    messageVersion: '2.2.0',
    cardholderInfo: payment_method.cardholder_name || 'Unknown',
    purchaseAmount: Math.round(parseFloat(payment_intent.amount) * 100).toString(),
    purchaseCurrency: payment_intent.currency === 'XOF' ? '952' : '840', // ISO 4217 numeric
    purchaseExponent: '2',
    purchaseDate: new Date().toISOString().replace(/[-:]/g, '').split('.')[0]
  };

  return Buffer.from(JSON.stringify(creqPayload)).toString('base64');
}

/**
 * Verify 3DS authentication result
 * @param {string} cres - Challenge Response (CRes) from ACS
 * @returns {Object} Authentication result
 */
function verify3DSResult(cres) {
  try {
    const decoded = JSON.parse(Buffer.from(cres, 'base64').toString());

    const transStatus = decoded.transStatus;
    const authenticated = transStatus === 'Y'; // Y = authenticated successfully
    const attempted = transStatus === 'A'; // A = authentication attempted
    const notAuthenticated = transStatus === 'N'; // N = not authenticated
    const rejected = transStatus === 'R'; // R = rejected

    return {
      authenticated,
      attempted,
      trans_status: transStatus,
      eci: decoded.eci || null, // Electronic Commerce Indicator
      cavv: decoded.authenticationValue || null, // Cardholder Authentication Verification Value
      xid: decoded.dsTransID || null,
      authentication_value: decoded.authenticationValue || null,
      status: authenticated ? 'authenticated' : attempted ? 'attempted' : 'not_authenticated'
    };
  } catch (error) {
    return {
      authenticated: false,
      attempted: false,
      trans_status: 'U', // Unable to authenticate
      error: error.message,
      status: 'failed'
    };
  }
}

module.exports = {
  isCard,
  start3DS2Session,
  verify3DSResult
};
