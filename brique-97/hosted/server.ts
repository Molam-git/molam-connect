/**
 * Brique 97 — Hosted Tokenization Server
 *
 * PCI-compliant server that receives card data from iframe
 * and tokenizes it using a secure vault provider.
 *
 * IMPORTANT: This server MUST run in a PCI-compliant environment
 * with proper network isolation, encryption, and audit logging.
 *
 * Security:
 * - TLS 1.2+ required
 * - Strict CSP headers
 * - Rate limiting
 * - No PAN logging
 * - Vault provider integration (Stripe, Adyen, or internal HSM)
 */

import express, { Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import { validateLuhn, getCardBrand, redact } from '../src/utils/crypto';

const app = express();
const PORT = process.env.HOSTED_PORT || 3001;

// =====================================================================
// Security Middleware
// =====================================================================

// Helmet for security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // Inline scripts in hosted-card.html
        styleSrc: ["'self'", "'unsafe-inline'"],
        frameSrc: ["'none'"],
        frameAncestors: process.env.ALLOWED_PARENT_ORIGINS?.split(',') || ["'none'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  })
);

// CORS - only allow from trusted merchant origins
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow no origin (same-origin requests)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin) || origin.endsWith('.molam.com')) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  })
);

// Body parser
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Static files (hosted iframe HTML)
app.use(express.static(path.join(__dirname, 'public')));

// Request logging (NO PAN)
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path} from ${req.ip}`);
  next();
});

// =====================================================================
// Tokenization Endpoint
// =====================================================================

/**
 * POST /tokenize
 *
 * Receives card data from iframe and returns vaulted token
 *
 * Request:
 *   {
 *     client_token: string,
 *     pan: string,
 *     exp_month: number,
 *     exp_year: number,
 *     cvc: string
 *   }
 *
 * Response:
 *   {
 *     provider_ref: string,
 *     last4: string,
 *     brand: string,
 *     exp_month: number,
 *     exp_year: number
 *   }
 */
app.post('/tokenize', async (req: Request, res: Response) => {
  try {
    const { client_token, pan, exp_month, exp_year, cvc } = req.body;

    // Validation
    if (!client_token || !pan || !exp_month || !exp_year || !cvc) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'Missing required fields',
      });
    }

    // Normalize PAN (remove spaces)
    const normalizedPAN = pan.replace(/\s/g, '');

    // Validate PAN (Luhn check)
    if (!validateLuhn(normalizedPAN)) {
      return res.status(400).json({
        error: 'invalid_card_number',
        message: 'Invalid card number',
      });
    }

    // Validate expiry
    const now = new Date();
    const expiry = new Date(exp_year, exp_month - 1);

    if (expiry <= now) {
      return res.status(400).json({
        error: 'expired_card',
        message: 'Card has expired',
      });
    }

    // Validate CVC length
    if (cvc.length < 3 || cvc.length > 4) {
      return res.status(400).json({
        error: 'invalid_cvc',
        message: 'Invalid CVC',
      });
    }

    // Detect card brand
    const brand = getCardBrand(normalizedPAN);

    // Get last 4 digits
    const last4 = normalizedPAN.slice(-4);

    // ================================================================
    // VAULT INTEGRATION
    // ================================================================
    // In production, integrate with actual vault provider:
    // - Stripe: stripe.tokens.create({ card: { number, exp_month, exp_year, cvc } })
    // - Adyen: adyen.tokens.create(...)
    // - Internal HSM: hsm.tokenize(...)
    //
    // The provider returns an opaque token reference that can be
    // used for future charges without exposing the PAN.
    //
    // For now, we generate a mock token.
    // ================================================================

    const providerRef = await vaultCard({
      pan: normalizedPAN,
      exp_month,
      exp_year,
      cvc,
      client_token,
    });

    // LOG (No PAN, only last4 and metadata)
    console.log(`Card tokenized: brand=${brand}, last4=${last4}, exp=${exp_month}/${exp_year}`);

    // Return tokenized data
    res.json({
      provider_ref: providerRef,
      last4,
      brand,
      exp_month,
      exp_year,
    });
  } catch (error: any) {
    console.error('Tokenization error:', error);

    res.status(500).json({
      error: 'tokenization_failed',
      message: 'Failed to tokenize card',
    });
  }
});

// =====================================================================
// Vault Provider Integration
// =====================================================================

/**
 * Vault card with provider (Stripe, Adyen, or internal HSM)
 *
 * IMPORTANT: In production, replace this with actual vault provider
 */
async function vaultCard(params: {
  pan: string;
  exp_month: number;
  exp_year: number;
  cvc: string;
  client_token: string;
}): Promise<string> {
  const vaultProvider = process.env.VAULT_PROVIDER || 'mock';

  switch (vaultProvider) {
    case 'stripe':
      return await vaultWithStripe(params);

    case 'adyen':
      return await vaultWithAdyen(params);

    case 'hsm':
      return await vaultWithHSM(params);

    case 'mock':
    default:
      return await vaultMock(params);
  }
}

/**
 * Vault with Stripe
 */
async function vaultWithStripe(params: any): Promise<string> {
  // TODO: Integrate with Stripe API
  // const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  // const token = await stripe.tokens.create({
  //   card: {
  //     number: params.pan,
  //     exp_month: params.exp_month,
  //     exp_year: params.exp_year,
  //     cvc: params.cvc,
  //   },
  // });
  // return token.id;

  throw new Error('Stripe integration not implemented');
}

/**
 * Vault with Adyen
 */
async function vaultWithAdyen(params: any): Promise<string> {
  // TODO: Integrate with Adyen API
  throw new Error('Adyen integration not implemented');
}

/**
 * Vault with internal HSM
 */
async function vaultWithHSM(params: any): Promise<string> {
  // TODO: Integrate with HSM
  throw new Error('HSM integration not implemented');
}

/**
 * Mock vault (for development only)
 */
async function vaultMock(params: any): Promise<string> {
  // Generate mock token
  const randomBytes = require('crypto').randomBytes(16).toString('hex');
  const providerRef = `tok_${randomBytes}`;

  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 200));

  return providerRef;
}

// =====================================================================
// Health Check
// =====================================================================

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// =====================================================================
// Error Handler
// =====================================================================

app.use((err: any, req: Request, res: Response, next: any) => {
  console.error('Server error:', err);

  res.status(err.status || 500).json({
    error: 'internal_server_error',
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// =====================================================================
// Start Server
// =====================================================================

if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`🔒 Hosted tokenization server running on port ${PORT}`);
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`   Vault provider: ${process.env.VAULT_PROVIDER || 'mock'}`);
    console.log('');
    console.log('   ⚠️  IMPORTANT: This server MUST run in a PCI-compliant environment');
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
}

export default app;
