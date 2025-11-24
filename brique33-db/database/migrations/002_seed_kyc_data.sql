-- database/migrations/002_seed_kyc_data.sql
INSERT INTO kyc_levels (code, name, description) VALUES
('P0', 'Non vérifié', 'Niveau de base sans vérification'),
('P1', 'Vérifié', 'Identité vérifiée'),
('P2', 'Professionnel', 'Compte professionnel vérifié'),
('P3', 'Business', 'Compte entreprise vérifié'),
('P4', 'Bank Partner', 'Partenaire bancaire');

INSERT INTO document_types (code, display_name, required_for) VALUES
('id_card', 'Carte d''identité', '[{"country":"SN","account_types":["personal","professional"]}]'),
('passport', 'Passeport', '[{"country":"*","account_types":["personal","professional"]}]'),
('proof_of_address', 'Justificatif de domicile', '[{"country":"SN","account_types":["personal","professional","business"]}]'),
('company_reg', 'Registre de commerce', '[{"country":"SN","account_types":["business"]}]'),
('tax_doc', 'Document fiscal', '[{"country":"SN","account_types":["business"]}]'),
('rib', 'Relevé d''identité bancaire', '[{"country":"*","account_types":["business","bank_partner"]}]');