-- database/functions/post_transfer_ledger.sql

CREATE OR REPLACE FUNCTION post_transfer_ledger(p_transfer_id UUID) RETURNS UUID AS $$
DECLARE
  t RECORD;
  txn_id UUID;
BEGIN
  SELECT * INTO t FROM molam_transfers WHERE id=p_transfer_id FOR UPDATE;
  
  IF t.status <> 'succeeded' THEN
    RAISE EXCEPTION 'Transfer % not succeeded', p_transfer_id;
  END IF;

  -- Main transfer
  INSERT INTO molam_wallet_transactions
    (debit_wallet_id, credit_wallet_id, amount, currency, txn_type, status, reference, initiated_by, module_origin, confirmed_at)
  VALUES
    (t.sender_wallet_id, t.receiver_wallet_id, t.amount, t.currency, 'transfer', 'success', t.reference, t.sender_id, 'pay', NOW())
  RETURNING id INTO txn_id;

  -- Fee (if any)
  IF t.fee_amount > 0 THEN
    INSERT INTO molam_wallet_transactions
      (debit_wallet_id, credit_wallet_id, amount, currency, txn_type, status, reference, initiated_by, module_origin, confirmed_at)
    VALUES
      (t.sender_wallet_id,
       (SELECT id FROM molam_wallets WHERE purpose='molam_revenue' AND currency=t.currency LIMIT 1),
       t.fee_amount, t.currency, 'fee', 'success', t.reference || '-FEE', t.sender_id, 'pay', NOW());
  END IF;

  -- Log event
  INSERT INTO molam_transfer_events (transfer_id, event_type, raw_payload)
  VALUES (p_transfer_id, 'ledger_posted', json_build_object('transaction_id', txn_id));

  RETURN txn_id;
END;
$$ LANGUAGE plpgsql;