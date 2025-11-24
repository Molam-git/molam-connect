-- Ledger entry types extended
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'reward_credit';
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'reward_debit';