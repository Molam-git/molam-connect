-- 003_fn_post_topup.sql

CREATE OR REPLACE FUNCTION post_topup_ledger(
  p_topup_id UUID
) RETURNS UUID AS $$
DECLARE
  t RECORD;
  provider_wallet UUID;
  txn_id UUID;
  ref TEXT;
BEGIN
  SELECT tp.*, pa.ledger_wallet_id INTO t
  FROM molam_topups tp
  JOIN molam_provider_accounts pa ON pa.provider_id = tp.provider_id
  WHERE tp.id = p_topup_id FOR UPDATE;

  IF t.status <> 'succeeded' THEN
    RAISE EXCEPTION 'Topup % not succeeded', p_topup_id;
  END IF;

  provider_wallet := t.ledger_wallet_id;
  ref := t.reference;

  -- 1) Provider float -> User wallet (principal)
  INSERT INTO molam_wallet_transactions
    (debit_wallet_id, credit_wallet_id, amount, currency, txn_type, status, reference, initiated_by, module_origin, confirmed_at)
  VALUES
    (provider_wallet, t.wallet_id, t.amount, t.currency, 'recharge', 'success', ref || '-MAIN', t.user_id, 'pay', NOW())
  RETURNING id INTO txn_id;

  -- 2) Fee to Molam revenue wallet (if any)
  IF t.fee_amount > 0 THEN
    INSERT INTO molam_wallet_transactions
      (debit_wallet_id, credit_wallet_id, amount, currency, txn_type, status, reference, initiated_by, module_origin, confirmed_at)
    VALUES
      (t.wallet_id, (SELECT id FROM molam_wallets WHERE purpose='molam_revenue' AND currency=t.currency LIMIT 1),
       t.fee_amount, t.currency, 'commission', 'success', ref || '-FEE', t.user_id, 'pay', NOW());
  END IF;

  -- 3) Agent commission (if agent involved)
  IF t.agent_commission > 0 AND (t.metadata->>'agent_wallet_id') IS NOT NULL THEN
    INSERT INTO molam_wallet_transactions
      (debit_wallet_id, credit_wallet_id, amount, currency, txn_type, status, reference, initiated_by, module_origin, confirmed_at)
    VALUES
      ((SELECT id FROM molam_wallets WHERE purpose='molam_commission_pool' AND currency=t.currency LIMIT 1),
       (t.metadata->>'agent_wallet_id')::uuid, t.agent_commission, t.currency, 'commission', 'success', ref || '-AGC', t.user_id, 'pay', NOW());
  END IF;

  RETURN txn_id;
END;
$$ LANGUAGE plpgsql;