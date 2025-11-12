// src/middleware/apikey.ts
import { decryptWithVault } from '../utils/secrets';
import { pool } from '../db';
export async function apiKeyAuth(req:any,res,next:any){
  // header: 'Authorization: MolamKey kid=abc123, sig=...'
  const header = req.headers['authorization'] || '';
  // parse kid or bearer
  // For simplicity, assume: Authorization: MolamKey <kid>:<sig>
  const m = header.split(' ')[1];
  if(!m) return res.status(401).json({error:'missing_key'});
  const [kid, sig] = m.split(':');
  const { rows:[row] } = await pool.query(`SELECT id, secret_ciphertext, scopes, app_id FROM api_keys WHERE kid=$1 AND status='active'`, [kid]);
  if(!row) return res.status(401).json({error:'invalid_key'});
  const secret = await decryptWithVault(row.secret_ciphertext);
  // verify signature HMAC over raw body or verify simple bearer (depending on chosen scheme)
  // omitted: verification code
  // attach key info
  req.apiKey = { id: row.id, appId: row.app_id, scopes: row.scopes };
  next();
}
