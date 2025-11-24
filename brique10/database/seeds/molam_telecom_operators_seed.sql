// database/seeds/molam_telecom_operators_seed.sql
INSERT INTO molam_telecom_operators 
(id, name, country_code, provider_type, aggregator_code, currency, commission_rate) VALUES
(gen_random_uuid(), 'Orange', 'SN', 'aggregator', 'ORANGE_SN_CREDIT', 'XOF', 2.5),
(gen_random_uuid(), 'MTN', 'SN', 'aggregator', 'MTN_SN_CREDIT', 'XOF', 2.0),
(gen_random_uuid(), 'Free', 'SN', 'aggregator', 'FREE_SN_CREDIT', 'XOF', 1.8),
(gen_random_uuid(), 'Orange', 'FR', 'aggregator', 'ORANGE_FR_CREDIT', 'EUR', 3.0),
(gen_random_uuid(), 'Bouygues', 'FR', 'aggregator', 'BOUYGUES_FR_CREDIT', 'EUR', 2.8);