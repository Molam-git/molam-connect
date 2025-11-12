// src/routes/devconsole.ts
import express from 'express';
import { pool } from '../db';
import { requireRole } from '../utils/authz';
import { encryptWithVault, generateApiKeySecret } from '../utils/secrets';

const router = express.Router();

// Create dev app
router.post('/apps', requireRole(['merchant_admin','dev_admin']), async (req:any,res)=>{
  const { tenantType, tenantId, name, environment } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO dev_apps(tenant_type, tenant_id, name, environment, created_by) VALUES($1,$2,$3,$4,$5) RETURNING *`,
    [tenantType, tenantId, name, environment||'test', req.user.id]
  );
  res.json(rows[0]);
});

// Create API key
router.post('/apps/:appId/keys', requireRole(['dev_admin','merchant_admin']), async (req:any,res)=>{
  const { appId } = req.params;
  const { scopes, environment } = req.body;
  // generate kid & secret
  const kid = Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
  const secret = generateApiKeySecret(); // strong random 40+ chars
  const ciphertext = await encryptWithVault(secret);
  const { rows } = await pool.query(
    `INSERT INTO api_keys(app_id, kid, secret_ciphertext, scopes, environment, created_at) VALUES($1,$2,$3,$4,$5,now()) RETURNING id,kid,environment`,
    [appId, kid, ciphertext, scopes || ['payments:read'], environment || 'test']
  );
  // return secret ONCE
  res.json({ key_id: rows[0].id, kid: rows[0].kid, secret_preview: secret.slice(0,8)+'…', secret });
});
