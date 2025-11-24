CREATE TABLE IF NOT EXISTS ref_currencies (
  currency_code CHAR(3) PRIMARY KEY,           -- ISO 4217
  num_code INTEGER NOT NULL,
  name TEXT NOT NULL,
  minor_unit SMALLINT NOT NULL CHECK (minor_unit BETWEEN 0 AND 4) -- decimals
);