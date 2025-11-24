-- 004_fn_post_withdrawal.sql

CREATE OR REPLACE FUNCTION post_withdrawal_ledger(
  p_withdrawal_id UUID
) RETURNS UUID AS $$
DECLARE
  w RECORD;
  provider_wallet UUID;
  txn_id UUID;
  ref TEXT;
BEGIN
  SELECT wd.*, pa.ledger_wallet_id INTO w
  FROM molam_withdrawals wd
  JOIN molam_payout_accounts pa ON pa.provider_id = wd.provider_id
  WHERE wd.id = p_withdrawal_id FOR UPDATE;

  IF w.status <> 'succeeded' THEN
    RAISE EXCEPTION 'Withdrawal % not succeeded', p_withdrawal_id;
  END IF;

  provider_wallet := w.ledger_wallet_id;
  ref := w.reference;

  -- 1) User wallet -> Provider float (principal)
  INSERT INTO molam_wallet_transactions
    (debit_wallet_id, credit_wallet_id, amount, currency, txn_type, status, reference, initiated_by, module_origin, confirmed_at)
  VALUES
    (w.wallet_id, provider_wallet, w.amount, w.currency, 'withdrawal', 'success', ref || '-MAIN', w.user_id, 'pay', NOW())
  RETURNING id INTO txn_id;

  -- 2) Fee to Molam revenue wallet (if any)
  IF w.fee_amount > 0 THEN
    INSERT INTO molam_wallet_transactions
      (debit_wallet_id, credit_wallet_id, amount, currency, txn_type, status, reference, initiated_by, module_origin, confirmed_at)
    VALUES
      (w.wallet_id, (SELECT id FROM molam_wallets WHERE purpose='molam_revenue' AND currency=w.currency LIMIT 1),
       w.fee_amount, w.currency, 'fee', 'success', ref || '-FEE', w.user_id, 'pay', NOW());
  END IF;

  -- 3) Agent commission (if agent involved)
  IF w.agent_commission > 0 AND (w.metadata->>'agent_wallet_id') IS NOT NULL THEN
    INSERT INTO molam_wallet_transactions
      (debit_wallet_id, credit_wallet_id, amount, currency, txn_type, status, reference, initiated_by, module_origin, confirmed_at)
    VALUES
      ((SELECT id FROM molam_wallets WHERE purpose='molam_commission_pool' AND currency=w.currency LIMIT 1),
       (w.metadata->>'agent_wallet_id')::uuid,
       w.agent_commission, w.currency, 'commission', 'success', ref || '-AGC', w.user_id, 'pay', NOW());
  END IF;

  RETURN txn_id;
END;
$$ LANGUAGE plpgsql;