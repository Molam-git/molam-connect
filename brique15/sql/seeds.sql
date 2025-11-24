-- English defaults
INSERT INTO notification_templates (event_key, channel, locale, subject_template, body_template)
VALUES
('p2p.completed','push','en','Transfer received','{receiverName}, you received {amount, number, ::currency/GBP} from {senderName}. Ref {txRef}.'),
('p2p.completed','sms','en',NULL,'You received {amount, number, ::currency/USD} from {senderName}. Ref {txRef}.'),
('p2p.completed','email','en','Transfer received','Hi {receiverName}, you received {amount, number, ::currency/USD} from {senderName}. Transaction {txRef}.'),
('merchant.payment_success','push','en','Payment successful','Paid {amount, number, ::currency/USD} at {merchantName}. Ref {txRef}.'),
('bill.paid','sms','en',NULL,'Bill paid: {biller} {amount, number, ::currency/USD}. Ref {txRef}.'),
('refund.processed','email','en','Refund processed','Your refund {amount, number, ::currency/USD} has been processed. Ref {txRef}.');

-- French defaults
INSERT INTO notification_templates (event_key, channel, locale, subject_template, body_template)
VALUES
('p2p.completed','push','fr','Transfert reçu','{receiverName}, vous avez reçu {amount, number, ::currency/EUR} de {senderName}. Ref {txRef}.'),
('p2p.completed','sms','fr',NULL,'Vous avez reçu {amount, number, ::currency/EUR} de {senderName}. Ref {txRef}.'),
('merchant.payment_success','push','fr','Paiement réussi','{amount, number, ::currency/EUR} payé chez {merchantName}. Ref {txRef}.'),
('bill.paid','sms','fr',NULL,'Facture payée : {biller} {amount, number, ::currency/EUR}. Ref {txRef}.'),
('refund.processed','email','fr','Remboursement effectué','Votre remboursement de {amount, number, ::currency/EUR} a été effectué. Ref {txRef}.');