CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_molam_wallets_updated_at
BEFORE UPDATE ON molam_wallets
FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- Ensure only one default wallet per (user,currency)
CREATE OR REPLACE FUNCTION enforce_single_default_wallet()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default THEN
    UPDATE molam_wallets
      SET is_default = FALSE, updated_at = NOW()
      WHERE user_id = NEW.user_id
        AND currency = NEW.currency
        AND id <> NEW.id
        AND is_default = TRUE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_single_default_wallet
AFTER INSERT OR UPDATE OF is_default ON molam_wallets
FOR EACH ROW EXECUTE PROCEDURE enforce_single_default_wallet();

-- Prevent moving from 'closed' to any other state
CREATE OR REPLACE FUNCTION prevent_reopen_closed_wallet()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'closed' AND NEW.status <> 'closed' THEN
    RAISE EXCEPTION 'Closed wallet cannot be reopened';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_reopen_closed_wallet
BEFORE UPDATE OF status ON molam_wallets
FOR EACH ROW EXECUTE PROCEDURE prevent_reopen_closed_wallet();