-- Rewards master (cashback, voucher, loyalty points)
CREATE TABLE molam_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('cashback', 'voucher', 'points')),
  name JSONB NOT NULL,
  description JSONB,
  reward_value NUMERIC(18,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  percentage NUMERIC(5,2),
  min_transaction NUMERIC(18,2),
  max_reward NUMERIC(18,2),
  valid_from TIMESTAMP NOT NULL,
  valid_until TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  sponsor TEXT,
  category TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Rewards earned by users
CREATE TABLE molam_user_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reward_id UUID NOT NULL REFERENCES molam_rewards(id),
  user_id UUID NOT NULL REFERENCES molam_users(id),
  transaction_id UUID REFERENCES molam_wallet_transactions(id),
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'used', 'expired', 'cancelled')),
  created_at TIMESTAMP DEFAULT NOW(),
  confirmed_at TIMESTAMP,
  used_at TIMESTAMP,
  expired_at TIMESTAMP,
  converted_at TIMESTAMP
);

-- Voucher codes (unique coupons linked to rewards)
CREATE TABLE molam_vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reward_id UUID NOT NULL REFERENCES molam_rewards(id),
  code TEXT UNIQUE NOT NULL,
  value NUMERIC(18,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  user_id UUID REFERENCES molam_users(id),
  is_redeemed BOOLEAN DEFAULT false,
  redeemed_at TIMESTAMP,
  valid_until TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);