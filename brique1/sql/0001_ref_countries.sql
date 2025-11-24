CREATE TABLE IF NOT EXISTS ref_countries (
  country_code CHAR(2) PRIMARY KEY,            -- ISO 3166-1 alpha-2
  name TEXT NOT NULL,
  phone_country_code VARCHAR(6) NOT NULL,      -- e.g. +221, +225
  currency_code CHAR(3) NOT NULL               -- default currency for country
);