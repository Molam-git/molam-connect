-- 01_agents.sql
CREATE TABLE IF NOT EXISTS molam_agents (
  agent_id            BIGSERIAL PRIMARY KEY,
  partner_code        TEXT NOT NULL,                         -- code attribué par Molam
  display_name        TEXT NOT NULL,
  country_code        TEXT NOT NULL,                         -- ISO-3166-1 alpha-2 (e.g. SN, CI, US)
  currencies          TEXT[] NOT NULL,                       -- ["XOF","USD",...]
  contact_phone_e164  TEXT NOT NULL UNIQUE,
  contact_email       TEXT,
  kyc_level           TEXT NOT NULL DEFAULT 'P1',            -- P1/P2/…
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  float_account_id    BIGINT,                                -- lien vers un wallet float agent (brique 1/2)
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS molam_agent_terminals (
  terminal_id   BIGSERIAL PRIMARY KEY,
  agent_id      BIGINT NOT NULL REFERENCES molam_agents(agent_id),
  serial_number TEXT NOT NULL UNIQUE,
  last_ip       INET,
  public_key_pem TEXT NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);