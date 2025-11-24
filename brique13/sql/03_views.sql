-- Vue d'historique enrichie
CREATE OR REPLACE VIEW v_tx_history_enriched AS
SELECT
  t.id,
  t.created_at,
  t.updated_at,
  t.tx_type,
  t.status,
  t.user_id,
  t.merchant_id,
  t.counterparty_id,
  t.amount,
  t.currency,
  t.country_code,
  t.channel,
  t.reference,
  f.molam_fee,
  f.partner_fee,
  f.agent_share,
  COALESCE(rw.total_reward_confirmed,0) AS reward_confirmed,
  COALESCE(rw.total_reward_pending,0) AS reward_pending,
  COALESCE(cb.total_clawback,0) AS reward_clawback,
  COALESCE(df.total_refunded,0) AS refunded_amount,
  sira.risk_score,
  sira.flags
FROM wallet_transactions t
LEFT JOIN wallet_tx_fees f ON f.tx_id = t.id
LEFT JOIN LATERAL (
  SELECT
    SUM(amount) FILTER (WHERE status='confirmed') AS total_reward_confirmed,
    SUM(amount) FILTER (WHERE status='pending') AS total_reward_pending
  FROM molam_user_rewards r
  WHERE r.tx_id = t.id
) rw ON TRUE
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(meta->>'claw_amount')::numeric,0) AS total_clawback
  FROM molam_reward_ledger l
  WHERE l.tx_id = t.id AND l.event = 'clawback'
) cb ON TRUE
LEFT JOIN LATERAL (
  SELECT SUM(refunded_amount) AS total_refunded
  FROM wallet_tx_refunds rf
  WHERE rf.tx_id = t.id
) df ON TRUE
LEFT JOIN LATERAL (
  SELECT score AS risk_score, flags
  FROM sira_tx_signals sg
  WHERE sg.tx_id = t.id
  ORDER BY sg.created_at DESC LIMIT 1
) sira ON TRUE;

-- Vue pour audit
CREATE OR REPLACE VIEW v_audit_history_access AS
SELECT 
  al.actor_id,
  al.action,
  al.details,
  al.created_at
FROM molam_audit_logs al
WHERE al.action LIKE 'history_%';