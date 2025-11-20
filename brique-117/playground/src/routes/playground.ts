/**
 * Brique 117-bis: Playground API Routes
 * API pour exécuter du code et gérer les sessions
 */

import express, { Request, Response } from 'express';
import { Pool } from 'pg';
import crypto from 'crypto';

const router = express.Router();

/**
 * Simuler l'exécution d'une requête API
 */
async function executeRequest(request: any) {
  // En production: appeler le vrai sandbox
  // Ici: simuler une réponse
  await new Promise(resolve => setTimeout(resolve, 500)); // Simuler latence

  const { method, path, body } = request;

  if (path.includes('/payments') && method === 'POST') {
    return {
      id: `pay_${Date.now()}`,
      amount: body?.amount || 5000,
      currency: body?.currency || 'XOF',
      status: 'succeeded',
      created_at: new Date().toISOString()
    };
  }

  if (path.includes('/payments') && method === 'GET') {
    return {
      id: path.split('/').pop(),
      amount: 5000,
      currency: 'XOF',
      status: 'succeeded',
      created_at: new Date().toISOString()
    };
  }

  return { message: 'Sandbox response' };
}

/**
 * Générer des suggestions Sira (heuristiques simples)
 */
function generateSiraSuggestions(request: any) {
  const suggestions = [];

  // Check idempotency
  if (['POST', 'PUT', 'DELETE'].includes(request.method?.toUpperCase())) {
    if (!request.headers?.['Idempotency-Key']) {
      suggestions.push({
        code: 'missing_idempotency',
        severity: 'warning',
        message: 'Ajoutez un header Idempotency-Key pour éviter les doublons',
        fix: 'Ajoutez: headers: { "Idempotency-Key": "unique-id" }'
      });
    }
  }

  // Check method
  if (!request.method) {
    suggestions.push({
      code: 'missing_method',
      severity: 'error',
      message: 'La méthode HTTP est requise',
      fix: 'Ajoutez: method: "POST"'
    });
  }

  // Check path
  if (!request.path) {
    suggestions.push({
      code: 'missing_path',
      severity: 'error',
      message: 'Le chemin API est requis',
      fix: 'Ajoutez: path: "/v1/payments"'
    });
  }

  return suggestions;
}

/**
 * Générer des snippets de code
 */
function generateSnippets(request: any) {
  const snippets = [];

  // Node.js
  snippets.push({
    language: 'node',
    code: `import Molam from 'molam-sdk';

const molam = new Molam('sk_test_xxx');

const result = await molam.request({
  method: '${request.method || 'POST'}',
  path: '${request.path || '/v1/payments'}',
  body: ${JSON.stringify(request.body || {}, null, 2)}
});

console.log(result);`
  });

  // cURL
  const curlMethod = request.method || 'POST';
  const curlPath = request.path || '/v1/payments';
  const curlBody = request.body ? ` -d '${JSON.stringify(request.body)}'` : '';

  snippets.push({
    language: 'curl',
    code: `curl -X ${curlMethod} https://api.molam.com${curlPath} \\
  -H "Authorization: Bearer sk_test_xxx" \\
  -H "Content-Type: application/json"${curlBody}`
  });

  // Python
  snippets.push({
    language: 'python',
    code: `import molam

client = molam.Client('sk_test_xxx')

result = client.request({
    'method': '${request.method || 'POST'}',
    'path': '${request.path || '/v1/payments'}',
    'body': ${JSON.stringify(request.body || {}, null, 2).replace(/"/g, "'")}
})

print(result)`
  });

  // PHP
  snippets.push({
    language: 'php',
    code: `<?php
require_once 'vendor/autoload.php';

$molam = new \\Molam\\Client('sk_test_xxx');

$result = $molam->request([
    'method' => '${request.method || 'POST'}',
    'path' => '${request.path || '/v1/payments'}',
    'body' => ${JSON.stringify(request.body || {})}
]);

print_r($result);`
  });

  return snippets;
}

/**
 * POST /api/playground/run
 * Exécuter une requête dans le playground
 */
router.post('/run', async (req: Request, res: Response) => {
  try {
    const db = req.app.locals.db as Pool;
    const request = req.body;
    const userId = req.headers['x-user-id'] as string || 'anonymous';

    // Créer une session
    const { rows: sessions } = await db.query(
      `INSERT INTO playground_sessions (
        tenant_type, created_by, title, request_json, status
      )
      VALUES ($1, $2, $3, $4, 'run')
      RETURNING *`,
      ['developer', userId, request.title || 'Untitled', request]
    );

    const session = sessions[0];

    // Exécuter la requête
    const response = await executeRequest(request);

    // Générer suggestions Sira
    const sira_suggestions = generateSiraSuggestions(request);

    // Mettre à jour la session
    await db.query(
      `UPDATE playground_sessions
       SET response_json = $2, sira_suggestions = $3, updated_at = now()
       WHERE id = $1`,
      [session.id, response, JSON.stringify(sira_suggestions)]
    );

    // Audit
    await db.query(
      `INSERT INTO playground_audit_logs (session_id, actor, action, details)
       VALUES ($1, $2, 'run_request', $3)`,
      [session.id, userId, JSON.stringify({ path: request.path })]
    );

    res.json({
      success: true,
      session_id: session.id,
      response,
      sira_suggestions
    });
  } catch (error: any) {
    console.error('Error running playground:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/playground/save
 * Sauvegarder une session avec snippets
 */
router.post('/save', async (req: Request, res: Response) => {
  try {
    const db = req.app.locals.db as Pool;
    const { sessionId } = req.body;
    const userId = req.headers['x-user-id'] as string || 'anonymous';

    // Récupérer la session
    const { rows: sessions } = await db.query(
      'SELECT * FROM playground_sessions WHERE id = $1',
      [sessionId]
    );

    if (sessions.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = sessions[0];

    // Générer snippets
    const snippets = generateSnippets(session.request_json);

    // Sauvegarder snippets
    for (const snippet of snippets) {
      await db.query(
        `INSERT INTO playground_snippets (session_id, language, code)
         VALUES ($1, $2, $3)`,
        [sessionId, snippet.language, snippet.code]
      );
    }

    // Mettre à jour statut
    await db.query(
      `UPDATE playground_sessions SET status = 'saved', updated_at = now()
       WHERE id = $1`,
      [sessionId]
    );

    // Audit
    await db.query(
      `INSERT INTO playground_audit_logs (session_id, actor, action)
       VALUES ($1, $2, 'save_session')`,
      [sessionId, userId]
    );

    res.json({ success: true, snippets });
  } catch (error: any) {
    console.error('Error saving session:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/playground/share
 * Générer un lien de partage
 */
router.post('/share', async (req: Request, res: Response) => {
  try {
    const db = req.app.locals.db as Pool;
    const { sessionId } = req.body;
    const userId = req.headers['x-user-id'] as string || 'anonymous';

    // Générer clé de partage
    const { rows } = await db.query('SELECT generate_share_key() as key');
    const shareKey = rows[0].key;

    // Mettre à jour session
    await db.query(
      `UPDATE playground_sessions
       SET share_key = $2, status = 'shared', updated_at = now()
       WHERE id = $1`,
      [sessionId, shareKey]
    );

    // Audit
    await db.query(
      `INSERT INTO playground_audit_logs (session_id, actor, action, details)
       VALUES ($1, $2, 'share_session', $3)`,
      [sessionId, userId, JSON.stringify({ share_key: shareKey })]
    );

    const baseUrl = process.env.DOCS_URL || 'https://docs.molam.com';
    res.json({
      success: true,
      url: `${baseUrl}/playground/${shareKey}`
    });
  } catch (error: any) {
    console.error('Error sharing session:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/playground/public/:shareKey
 * Récupérer une session publique
 */
router.get('/public/:shareKey', async (req: Request, res: Response) => {
  try {
    const db = req.app.locals.db as Pool;
    const { shareKey } = req.params;

    const { rows } = await db.query(
      `SELECT id, title, description, request_json, response_json, created_at
       FROM playground_sessions
       WHERE share_key = $1 AND status = 'shared'`,
      [shareKey]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Récupérer snippets
    const { rows: snippets } = await db.query(
      'SELECT language, code FROM playground_snippets WHERE session_id = $1',
      [rows[0].id]
    );

    res.json({
      success: true,
      session: rows[0],
      snippets
    });
  } catch (error: any) {
    console.error('Error fetching public session:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/playground/sessions
 * Lister les sessions de l'utilisateur
 */
router.get('/sessions', async (req: Request, res: Response) => {
  try {
    const db = req.app.locals.db as Pool;
    const userId = req.headers['x-user-id'] as string || 'anonymous';
    const { limit = 50 } = req.query;

    const { rows } = await db.query(
      `SELECT id, title, request_json, status, created_at
       FROM playground_sessions
       WHERE created_by = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    res.json({
      success: true,
      sessions: rows,
      count: rows.length
    });
  } catch (error: any) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
