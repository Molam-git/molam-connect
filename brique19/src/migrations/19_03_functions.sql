-- src/migrations/19_03_functions.sql
-- Accumule la part agent dès qu'une commission est créée (Brique 18)
CREATE OR REPLACE FUNCTION fn_commission_accrue_balance()
RETURNS TRIGGER AS $$
BEGIN
  -- upsert dans balances (accrued)
  INSERT INTO molam_agent_commission_balances(agent_id, currency, accrued_minor, updated_at)
  VALUES (NEW.agent_id, NEW.currency, NEW.agent_share_minor, NOW())
  ON CONFLICT (agent_id, currency)
  DO UPDATE SET accrued_minor = molam_agent_commission_balances.accrued_minor + EXCLUDED.accrued_minor,
                updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_commission_accrue_balance ON molam_agent_commissions;
CREATE TRIGGER trg_commission_accrue_balance
AFTER INSERT ON molam_agent_commissions
FOR EACH ROW EXECUTE FUNCTION fn_commission_accrue_balance();

-- Fige une plage en "statement" : déplace accrued -> locked et rattache les lignes
CREATE OR REPLACE FUNCTION fn_commission_lock_period(
  p_agent_id BIGINT,
  p_currency TEXT,
  p_start    TIMESTAMPTZ,
  p_end      TIMESTAMPTZ
) RETURNS BIGINT AS $$
DECLARE
  v_statement_id BIGINT;
  v_locked BIGINT := 0;
BEGIN
  -- Crée l'entête
  INSERT INTO molam_agent_statements(agent_id, currency, period_start, period_end, status)
  VALUES (p_agent_id, p_currency, p_start, p_end, 'OPEN')
  RETURNING statement_id INTO v_statement_id;

  -- Sélectionne les commissions accrues dans la période et non encore liées à un statement
  INSERT INTO molam_agent_statement_lines(statement_id, op_id, fee_minor, agent_share_minor)
  SELECT v_statement_id, c.op_id, c.fee_minor, c.agent_share_minor
  FROM molam_agent_commissions c
  JOIN molam_cash_operations o ON o.op_id = c.op_id
  WHERE c.agent_id = p_agent_id
    AND c.currency = p_currency
    AND c.status = 'ACCRUED'
    AND o.status = 'APPROVED'
    AND o.created_at >= p_start AND o.created_at < p_end;

  -- Somme des lignes
  SELECT COALESCE(SUM(agent_share_minor),0) INTO v_locked
  FROM molam_agent_statement_lines WHERE statement_id = v_statement_id;

  -- Met à jour l'entête
  UPDATE molam_agent_statements
     SET gross_minor = v_locked,
         net_minor   = v_locked, -- avant ajustements
         updated_at  = NOW()
   WHERE statement_id = v_statement_id;

  -- Décrémente accrued et incrémente locked dans balances
  UPDATE molam_agent_commission_balances
     SET accrued_minor = GREATEST(accrued_minor - v_locked, 0),
         locked_minor  = locked_minor + v_locked,
         updated_at    = NOW()
   WHERE agent_id = p_agent_id AND currency = p_currency;

  RETURN v_statement_id;
END;
$$ LANGUAGE plpgsql;

-- Applique un ajustement sur un statement ouvert
CREATE OR REPLACE FUNCTION fn_statement_apply_adjustment(
  p_statement_id BIGINT,
  p_amount_minor BIGINT,  -- +/- 
  p_reason TEXT
) RETURNS VOID AS $$
BEGIN
  UPDATE molam_agent_statements
     SET adjustments_minor = adjustments_minor + p_amount_minor,
         net_minor         = gross_minor + adjustments_minor + p_amount_minor
   WHERE statement_id = p_statement_id
     AND status IN ('OPEN');
END;
$$ LANGUAGE plpgsql;

-- Verrouille le statement (prêt pour payout)
CREATE OR REPLACE FUNCTION fn_statement_lock(p_statement_id BIGINT) RETURNS VOID AS $$
BEGIN
  UPDATE molam_agent_statements
     SET status='LOCKED', locked_at=NOW()
   WHERE statement_id = p_statement_id
     AND status='OPEN';
END;
$$ LANGUAGE plpgsql;