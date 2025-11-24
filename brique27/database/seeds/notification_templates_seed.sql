-- Templates for wallet.p2p.succeeded
INSERT INTO notification_templates (event_type, lang, channel, subject, body, version, is_active) VALUES
('wallet.p2p.succeeded', 'en', 'push', 'Money sent', 'You sent {{amount_local_fmt}} (≈ ${{amount_usd}}) to {{counterparty_masked}}. Fee: {{fee_molam_fmt}}. Ref {{txn_ref}}.', 1, true),
('wallet.p2p.succeeded', 'fr', 'push', 'Argent envoyé', 'Vous avez envoyé {{amount_local_fmt}} (≈ ${{amount_usd}}) à {{counterparty_masked}}. Frais Molam: {{fee_molam_fmt}}. Ref {{txn_ref}}.', 1, true),
('wallet.p2p.succeeded', 'en', 'sms', NULL, 'You sent {{amount_local_fmt}} (≈ ${{amount_usd}}) to {{counterparty_masked}}. Fee: {{fee_molam_fmt}}. Ref {{txn_ref}}.', 1, true),
('wallet.p2p.succeeded', 'fr', 'sms', NULL, 'Vous avez envoyé {{amount_local_fmt}} (≈ ${{amount_usd}}) à {{counterparty_masked}}. Frais Molam: {{fee_molam_fmt}}. Ref {{txn_ref}}.', 1, true),

-- Templates for wallet.cashin.other.succeeded
('wallet.cashin.other.succeeded', 'en', 'sms', NULL, 'Cash-in for {{receiver_masked}}: {{amount_local_fmt}}. Issuer fee: {{fee_molam_fmt}} (agent share if applicable). Ref {{txn_ref}}.', 1, true),
('wallet.cashin.other.succeeded', 'fr', 'sms', NULL, 'Cash-in pour {{receiver_masked}}: {{amount_local_fmt}}. Frais émetteur: {{fee_molam_fmt}} (partage agent si applicable). Ref {{txn_ref}}.', 1, true),

-- Templates for wallet.cashout.succeeded
('wallet.cashout.succeeded', 'en', 'push', NULL, 'Cash-out {{amount_local_fmt}} at agent {{agent_code}}. Customer pays $0.00. Ref {{txn_ref}}.', 1, true),
('wallet.cashout.succeeded', 'fr', 'push', NULL, 'Cash-out {{amount_local_fmt}} à l''agent {{agent_code}}. Le client paie 0.00 $. Ref {{txn_ref}}.', 1, true),

-- Templates for wallet.refund.succeeded
('wallet.refund.succeeded', 'en', 'push', 'Refund completed', 'Refund of {{amount_local_fmt}} has been completed. Ref {{txn_ref}}.', 1, true),
('wallet.refund.succeeded', 'fr', 'push', 'Remboursement effectué', 'Le remboursement de {{amount_local_fmt}} a été effectué. Ref {{txn_ref}}.', 1, true),

-- Templates for wallet.invoice.paid
('wallet.invoice.paid', 'en', 'push', 'Invoice paid', 'Invoice {{invoice_number}} for {{amount_local_fmt}} has been paid. Ref {{txn_ref}}.', 1, true),
('wallet.invoice.paid', 'fr', 'push', 'Facture payée', 'La facture {{invoice_number}} de {{amount_local_fmt}} a été payée. Ref {{txn_ref}}.', 1, true),

-- Templates for wallet.topup.carrier.paid
('wallet.topup.carrier.paid', 'en', 'push', 'Top-up successful', 'Your top-up of {{amount_local_fmt}} was successful. Ref {{txn_ref}}.', 1, true),
('wallet.topup.carrier.paid', 'fr', 'push', 'Recharge réussie', 'Votre recharge de {{amount_local_fmt}} a été effectuée avec succès. Ref {{txn_ref}}.', 1, true),

-- Templates for agent.settlement.generated
('agent.settlement.generated', 'en', 'email', 'Settlement generated', 'Your settlement for {{amount_local_fmt}} has been generated. Ref {{settlement_ref}}.', 1, true),
('agent.settlement.generated', 'fr', 'email', 'Règlement généré', 'Votre règlement de {{amount_local_fmt}} a été généré. Ref {{settlement_ref}}.', 1, true),

-- Templates for agent.settlement.paid
('agent.settlement.paid', 'en', 'email', 'Settlement paid', 'Your settlement for {{amount_local_fmt}} has been paid. Ref {{settlement_ref}}.', 1, true),
('agent.settlement.paid', 'fr', 'email', 'Règlement payé', 'Votre règlement de {{amount_local_fmt}} a été payé. Ref {{settlement_ref}}.', 1, true),

-- Templates for risk.alert
('risk.alert', 'en', 'webhook', NULL, 'Risk alert: {{alert_message}}. Transaction: {{txn_ref}}.', 1, true),
('risk.alert', 'fr', 'webhook', NULL, 'Alerte risque: {{alert_message}}. Transaction: {{txn_ref}}.', 1, true)
ON CONFLICT (event_type, lang, channel, version) DO UPDATE SET
  subject = EXCLUDED.subject,
  body = EXCLUDED.body,
  is_active = EXCLUDED.is_active,
  updated_at = now();