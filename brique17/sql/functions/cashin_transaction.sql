-- Fonction PL/pgSQL pour le cash-in
CREATE OR REPLACE FUNCTION cashin_transaction(
    p_agent_id UUID,
    p_user_id UUID,
    p_amount NUMERIC,
    p_currency TEXT
)
RETURNS UUID AS $$
DECLARE
    v_tx_id UUID;
    v_agent_balance NUMERIC;
    v_user_balance NUMERIC;
BEGIN
    -- Vérifier que l'agent a suffisamment de float
    SELECT balance INTO v_agent_balance 
    FROM agent_wallets 
    WHERE agent_id = p_agent_id AND currency = p_currency;
    
    IF v_agent_balance < p_amount THEN
        RAISE EXCEPTION 'Insufficient agent float';
    END IF;

    -- Vérifier que l'utilisateur existe et est actif
    IF NOT EXISTS (SELECT 1 FROM molam_users WHERE id = p_user_id AND status = 'ACTIVE') THEN
        RAISE EXCEPTION 'User not found or inactive';
    END IF;

    -- Débiter le float de l'agent
    UPDATE agent_wallets 
    SET balance = balance - p_amount, 
        updated_at = NOW()
    WHERE agent_id = p_agent_id AND currency = p_currency
    RETURNING balance INTO v_agent_balance;

    -- Créditer le wallet utilisateur
    UPDATE molam_wallets 
    SET balance = balance + p_amount, 
        updated_at = NOW()
    WHERE user_id = p_user_id AND currency = p_currency
    RETURNING balance INTO v_user_balance;

    -- Insérer la transaction agent
    INSERT INTO agent_transactions (
        agent_id, 
        user_id, 
        type, 
        amount, 
        currency, 
        status
    ) VALUES (
        p_agent_id,
        p_user_id,
        'CASHIN',
        p_amount,
        p_currency,
        'SUCCESS'
    ) RETURNING tx_id INTO v_tx_id;

    -- Ledger utilisateur
    INSERT INTO wallet_transactions (
        user_id,
        type,
        amount,
        currency,
        status,
        reference_id
    ) VALUES (
        p_user_id,
        'CASHIN',
        p_amount,
        p_currency,
        'SUCCESS',
        v_tx_id
    );

    -- Log d'audit
    INSERT INTO cashin_audit_logs (
        transaction_id,
        agent_id,
        user_id,
        amount,
        currency,
        status
    ) VALUES (
        v_tx_id,
        p_agent_id,
        p_user_id,
        p_amount,
        p_currency,
        'SUCCESS'
    );

    -- Métriques
    INSERT INTO cashin_metrics (
        agent_id,
        country,
        amount,
        success
    ) VALUES (
        p_agent_id,
        SUBSTRING(p_currency FROM 1 FOR 3),
        p_amount,
        true
    );

    RETURN v_tx_id;

EXCEPTION
    WHEN OTHERS THEN
        -- Log de l'erreur
        INSERT INTO cashin_metrics (
            agent_id,
            country,
            amount,
            success
        ) VALUES (
            p_agent_id,
            SUBSTRING(p_currency FROM 1 FOR 3),
            p_amount,
            false
        );
        RAISE;
END;
$$ LANGUAGE plpgsql;

les fichiers qui sont vides midleware/security  , 