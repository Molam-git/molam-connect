/**
 * SOUS-BRIQUE 140bis — Sira Dev Assistant
 * AI-powered code generation and debugging
 */

import { pool } from '../db';

interface SiraAssistOptions {
  developerId: string;
  query: string;
  lang?: 'node' | 'php' | 'python';
  context?: {
    endpoint?: string;
    error?: string;
  };
}

/**
 * Sira AI Assistant - Generate code snippets
 */
export async function siraAssist(options: SiraAssistOptions): Promise<string> {
  const { developerId, query, lang = 'node', context } = options;

  // Build prompt for Sira
  const prompt = `
Tu es Sira, assistant technique de Molam Pay.
Langue cible: ${lang}
Question: ${query}

${context?.endpoint ? `Endpoint: ${context.endpoint}` : ''}
${context?.error ? `Erreur rencontrée: ${context.error}` : ''}

Fournis un snippet ${lang} complet, sécurisé et prêt pour la production.
Inclus:
- Gestion d'erreurs
- HMAC signature si nécessaire
- Bonnes pratiques
- Commentaires clairs en français
`;

  // Call Sira API (OpenAI-compatible endpoint)
  const siraApiUrl = process.env.SIRA_API_URL || 'https://api.openai.com/v1/chat/completions';
  const siraApiKey = process.env.SIRA_API_KEY || process.env.OPENAI_API_KEY;

  if (!siraApiKey) {
    throw new Error('SIRA_API_KEY not configured');
  }

  try {
    const response = await fetch(siraApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${siraApiKey}`,
      },
      body: JSON.stringify({
        model: process.env.SIRA_MODEL || 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'Tu es Sira, assistant technique expert de Molam Pay. Tu génères du code production-ready.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 1500,
      }),
    });

    const data = await response.json();
    const suggestion = data.choices?.[0]?.message?.content || 'Erreur: Impossible de générer le snippet';

    // Store in database for learning
    await pool.query(
      `INSERT INTO dev_ai_feedback (developer_id, query, suggestion, lang)
       VALUES ($1, $2, $3, $4)`,
      [developerId, query, { text: suggestion }, lang]
    );

    return suggestion;
  } catch (error) {
    console.error('[Sira] Error calling AI API:', error);
    // Fallback to static snippet
    return getFallbackSnippet(query, lang);
  }
}

/**
 * Fallback static snippets when Sira API unavailable
 */
function getFallbackSnippet(query: string, lang: string): string {
  const snippets: Record<string, Record<string, string>> = {
    node: {
      payment: `
// Créer un paiement avec Molam Pay
const crypto = require('crypto');
const fetch = require('node-fetch');

const KEY_ID = 'ak_test_your_key';
const SECRET = 'sk_test_your_secret';

async function createPayment(amount, currency) {
  const body = JSON.stringify({ amount, currency });
  const signature = crypto
    .createHmac('sha256', SECRET)
    .update(body)
    .digest('hex');

  const response = await fetch('https://api.molam.com/v1/payments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': \`\${KEY_ID}:\${signature}\`,
    },
    body,
  });

  return response.json();
}

// Utilisation
createPayment(1000, 'XOF')
  .then(console.log)
  .catch(console.error);
      `,
    },
    php: {
      payment: `
<?php
// Créer un paiement avec Molam Pay
function createPayment($amount, $currency) {
    $keyId = 'ak_test_your_key';
    $secret = 'sk_test_your_secret';

    $body = json_encode(['amount' => $amount, 'currency' => $currency]);
    $signature = hash_hmac('sha256', $body, $secret);

    $ch = curl_init('https://api.molam.com/v1/payments');
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        "X-API-Key: $keyId:$signature"
    ]);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);

    $response = curl_exec($ch);
    curl_close($ch);

    return json_decode($response, true);
}

// Utilisation
$result = createPayment(1000, 'XOF');
print_r($result);
?>
      `,
    },
    python: {
      payment: `
# Créer un paiement avec Molam Pay
import hmac
import hashlib
import json
import requests

KEY_ID = 'ak_test_your_key'
SECRET = 'sk_test_your_secret'

def create_payment(amount, currency):
    body = json.dumps({'amount': amount, 'currency': currency})
    signature = hmac.new(
        SECRET.encode(),
        body.encode(),
        hashlib.sha256
    ).hexdigest()

    response = requests.post(
        'https://api.molam.com/v1/payments',
        headers={
            'Content-Type': 'application/json',
            'X-API-Key': f'{KEY_ID}:{signature}'
        },
        data=body
    )

    return response.json()

# Utilisation
result = create_payment(1000, 'XOF')
print(result)
      `,
    },
  };

  const defaultSnippet = snippets[lang]?.payment || '// Snippet non disponible';
  return `// Fallback snippet (Sira API indisponible)\n${defaultSnippet}`;
}

/**
 * Submit feedback on Sira suggestion
 */
export async function submitFeedback(
  feedbackId: string,
  rating: number,
  feedbackText?: string
): Promise<void> {
  await pool.query(
    `UPDATE dev_ai_feedback
     SET rating = $1, feedback_text = $2, was_helpful = $3
     WHERE id = $4`,
    [rating, feedbackText, rating >= 4, feedbackId]
  );
}

/**
 * Debug API call error with Sira
 */
export async function siraDebug(
  developerId: string,
  endpoint: string,
  statusCode: number,
  errorMessage: string
): Promise<string> {
  const query = `Debug: Erreur ${statusCode} sur ${endpoint}. Message: ${errorMessage}`;

  return siraAssist({
    developerId,
    query,
    lang: 'node',
    context: { endpoint, error: errorMessage },
  });
}
