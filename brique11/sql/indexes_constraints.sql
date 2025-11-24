CREATE INDEX idx_rewards_active ON molam_rewards(is_active, valid_until, valid_from);
CREATE INDEX idx_rewards_category ON molam_rewards(category, type);
CREATE INDEX idx_user_rewards_status ON molam_user_rewards(user_id, status);
CREATE INDEX idx_user_rewards_created ON molam_user_rewards(created_at);
CREATE INDEX idx_vouchers_code ON molam_vouchers(code);
CREATE INDEX idx_vouchers_user ON molam_vouchers(user_id, is_redeemed);
CREATE INDEX idx_transactions_reward_eligibility ON molam_wallet_transactions(user_id, status, transaction_type, created_at);