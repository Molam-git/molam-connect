/**
 * SOUS-BRIQUE 140ter — Auto-Debug Worker
 * Analyse locale des erreurs SDK/API sans appel externe
 */

import { pool } from '../db';

export async function analyzeError(
  devId: string,
  lang: 'node' | 'php' | 'python',
  errMsg: string,
  ctx: any
) {
  let fix: any = null;

  // Analyse pattern-based des erreurs courantes
  if (errMsg.includes('401')) {
    fix = {
      action: 'Vérifier clé API',
      snippet: sampleApiKeyFix(lang),
      category: 'authentication',
    };
  }

  if (errMsg.includes('timeout')) {
    fix = {
      action: 'Augmenter timeout',
      snippet: sampleTimeoutFix(lang),
      category: 'network',
    };
  }

  if (errMsg.includes('invalid_currency')) {
    fix = {
      action: 'Corriger devise',
      snippet: sampleCurrencyFix(lang),
      category: 'validation',
    };
  }

  if (errMsg.includes('HMAC') || errMsg.includes('signature')) {
    fix = {
      action: 'Vérifier signature HMAC',
      snippet: sampleHmacFix(lang),
      category: 'authentication',
    };
  }

  if (errMsg.includes('rate_limit') || errMsg.includes('429')) {
    fix = {
      action: 'Gérer rate limiting',
      snippet: sampleRateLimitFix(lang),
      category: 'rate_limit',
    };
  }

  if (errMsg.includes('invalid_request') || errMsg.includes('400')) {
    fix = {
      action: 'Vérifier format de la requête',
      snippet: sampleRequestValidationFix(lang),
      category: 'validation',
    };
  }

  // Stocker en base pour audit et apprentissage
  await pool.query(
    `INSERT INTO dev_auto_debug_logs(developer_id, sdk_language, error_message, context, proposed_fix)
     VALUES ($1,$2,$3,$4,$5)`,
    [devId, lang, errMsg, ctx, fix]
  );

  return fix;
}

function sampleApiKeyFix(lang: string) {
  switch (lang) {
    case 'node':
      return `const client = new MolamClient({ apiKey: process.env.MOLAM_API_KEY });`;
    case 'php':
      return `$client = new MolamClient(['apiKey' => getenv("MOLAM_API_KEY")]);`;
    case 'python':
      return `client = MolamClient(api_key=os.getenv("MOLAM_API_KEY"))`;
  }
}

function sampleTimeoutFix(lang: string) {
  switch (lang) {
    case 'node':
      return `const client = new MolamClient({
  apiKey: process.env.MOLAM_API_KEY,
  timeout: 10000 // 10 secondes
});`;
    case 'php':
      return `$client = new MolamClient([
  'apiKey' => getenv("MOLAM_API_KEY"),
  'timeout' => 10000 // 10 secondes
]);`;
    case 'python':
      return `client = MolamClient(
  api_key=os.getenv("MOLAM_API_KEY"),
  timeout=10000  # 10 secondes
)`;
  }
}

function sampleCurrencyFix(lang: string) {
  return `// Devises supportées par Molam Pay:
// XOF, XAF, NGN, GHS, KES, USD, EUR
// Exemple: currency = "XOF"`;
}

function sampleHmacFix(lang: string) {
  switch (lang) {
    case 'node':
      return `const crypto = require('crypto');
const signature = crypto
  .createHmac('sha256', secretKey)
  .update(JSON.stringify(requestBody))
  .digest('hex');

headers['X-API-Key'] = \`\${keyId}:\${signature}\`;`;
    case 'php':
      return `$signature = hash_hmac(
  'sha256',
  json_encode($requestBody),
  $secretKey
);

$headers['X-API-Key'] = "$keyId:$signature";`;
    case 'python':
      return `import hmac
import hashlib
import json

signature = hmac.new(
  secret_key.encode(),
  json.dumps(request_body).encode(),
  hashlib.sha256
).hexdigest()

headers['X-API-Key'] = f"{key_id}:{signature}"`;
  }
}

function sampleRateLimitFix(lang: string) {
  switch (lang) {
    case 'node':
      return `// Gérer les erreurs 429 avec retry exponentiel
async function apiCallWithRetry(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (err.status === 429 && i < maxRetries - 1) {
        const delay = Math.pow(2, i) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
}`;
    case 'php':
      return `// Gérer les erreurs 429 avec retry exponentiel
function apiCallWithRetry($fn, $maxRetries = 3) {
  for ($i = 0; $i < $maxRetries; $i++) {
    try {
      return $fn();
    } catch (Exception $e) {
      if ($e->getCode() === 429 && $i < $maxRetries - 1) {
        $delay = pow(2, $i) * 1000000; // microseconds
        usleep($delay);
        continue;
      }
      throw $e;
    }
  }
}`;
    case 'python':
      return `# Gérer les erreurs 429 avec retry exponentiel
import time

def api_call_with_retry(fn, max_retries=3):
    for i in range(max_retries):
        try:
            return fn()
        except Exception as e:
            if hasattr(e, 'status') and e.status == 429 and i < max_retries - 1:
                delay = (2 ** i) * 1.0
                time.sleep(delay)
                continue
            raise e`;
  }
}

function sampleRequestValidationFix(lang: string) {
  switch (lang) {
    case 'node':
      return `// Valider les champs requis avant l'appel API
const payment = {
  amount: 1000,        // Requis, en centimes
  currency: "XOF",     // Requis
  customer_id: "cus_xxx", // Requis
  description: "Achat" // Optionnel
};

// Vérifier les champs requis
if (!payment.amount || !payment.currency || !payment.customer_id) {
  throw new Error("Champs requis manquants");
}`;
    case 'php':
      return `// Valider les champs requis avant l'appel API
$payment = [
  'amount' => 1000,        // Requis, en centimes
  'currency' => 'XOF',     // Requis
  'customer_id' => 'cus_xxx', // Requis
  'description' => 'Achat' // Optionnel
];

// Vérifier les champs requis
if (empty($payment['amount']) || empty($payment['currency']) || empty($payment['customer_id'])) {
  throw new Exception("Champs requis manquants");
}`;
    case 'python':
      return `# Valider les champs requis avant l'appel API
payment = {
  'amount': 1000,        # Requis, en centimes
  'currency': 'XOF',     # Requis
  'customer_id': 'cus_xxx', # Requis
  'description': 'Achat' # Optionnel
}

# Vérifier les champs requis
required_fields = ['amount', 'currency', 'customer_id']
if not all(payment.get(field) for field in required_fields):
    raise ValueError("Champs requis manquants")`;
  }
}

/**
 * Marquer une erreur comme résolue
 */
export async function markErrorResolved(logId: string): Promise<void> {
  await pool.query(
    `UPDATE dev_auto_debug_logs
     SET resolved = true, resolved_at = now()
     WHERE id = $1`,
    [logId]
  );
}

/**
 * Récupérer les erreurs non résolues d'un développeur
 */
export async function getUnresolvedErrors(developerId: string, limit = 10) {
  const result = await pool.query(
    `SELECT * FROM dev_auto_debug_logs
     WHERE developer_id = $1 AND resolved = false
     ORDER BY created_at DESC
     LIMIT $2`,
    [developerId, limit]
  );
  return result.rows;
}

/**
 * Stats d'erreurs par catégorie
 */
export async function getErrorStats(developerId: string) {
  const result = await pool.query(
    `SELECT
       sdk_language,
       proposed_fix->>'category' as category,
       COUNT(*) as total,
       SUM(CASE WHEN resolved THEN 1 ELSE 0 END) as resolved_count
     FROM dev_auto_debug_logs
     WHERE developer_id = $1
     GROUP BY sdk_language, proposed_fix->>'category'`,
    [developerId]
  );
  return result.rows;
}
