# Molam Sample App - Node.js

Application complète démontrant l'intégration de Molam Connect.

## 🚀 Démarrage Rapide

```bash
# 1. Installer les dépendances
npm install

# 2. Configurer l'environnement
cp .env.example .env
# Éditer .env et ajouter votre clé API

# 3. Démarrer le serveur
npm start
```

Accédez à : **http://localhost:3000**

## 📦 Fonctionnalités

- ✅ **Créer un paiement** - POST /create-payment
- ✅ **Vérifier le statut** - GET /payment-status/:id
- ✅ **Créer un remboursement** - POST /create-refund
- ✅ **Gérer les webhooks** - POST /webhooks/molam
- ✅ **Interface web** - Formulaire de test complet

## 🔧 API Endpoints

### Créer un paiement

```bash
curl -X POST http://localhost:3000/create-payment \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 5000,
    "currency": "XOF",
    "method": "wallet",
    "phone": "+221771234567"
  }'
```

### Vérifier le statut

```bash
curl http://localhost:3000/payment-status/pay_1234567890
```

### Créer un remboursement

```bash
curl -X POST http://localhost:3000/create-refund \
  -H "Content-Type: application/json" \
  -d '{
    "payment_id": "pay_1234567890",
    "reason": "Demande du client"
  }'
```

## 🔐 Configuration

### Variables d'environnement

```env
MOLAM_SECRET_KEY=sk_test_your_api_key
MOLAM_WEBHOOK_SECRET=whsec_your_webhook_secret
PORT=3000
```

### Obtenir les clés

1. Créez un compte sur [https://dashboard.molam.com](https://dashboard.molam.com)
2. Allez dans **API Keys**
3. Générez une clé de test
4. Copiez dans `.env`

## 📊 Interface Web

L'interface inclut:

- 🎨 **Design moderne** - UI gradient élégante
- 📱 **Responsive** - Fonctionne sur mobile
- ✨ **UX fluide** - Animations et feedback
- 🔄 **Temps réel** - Résultats instantanés

### Onglets

1. **Paiement** - Créer un nouveau paiement
2. **Remboursement** - Rembourser un paiement existant

## 🌍 Devises Supportées

- **XOF** - Franc CFA (Afrique de l'Ouest)
- **EUR** - Euro
- **USD** - Dollar américain
- **GNF** - Franc guinéen
- **XAF** - Franc CFA (Afrique Centrale)

## 🔄 Webhooks

### Configuration

1. Dans le dashboard Molam, configurez l'URL:
   ```
   https://your-domain.com/webhooks/molam
   ```

2. Copiez le secret webhook dans `.env`

### Événements supportés

- `payment.succeeded` - Paiement réussi
- `payment.failed` - Paiement échoué
- `refund.created` - Remboursement créé

## 🧪 Tests

### Test manuel avec cURL

```bash
# Simuler un webhook
curl -X POST http://localhost:3000/webhooks/molam \
  -H "Content-Type: application/json" \
  -H "Molam-Signature: t=123,v1=abc" \
  -d '{
    "type": "payment.succeeded",
    "data": {
      "id": "pay_123",
      "amount": 5000,
      "currency": "XOF"
    }
  }'
```

## 📝 Structure

```
sample-app-node/
├── server.js           # Backend Express
├── public/
│   └── index.html      # Frontend
├── package.json
├── .env.example
└── README.md
```

## 🛠️ Développement

### Mode développement avec hot-reload

```bash
npm run dev
```

### Production

```bash
npm start
```

## 🐛 Debugging

### Vérifier la connexion

```bash
curl http://localhost:3000/health
```

Réponse attendue:
```json
{
  "status": "ok",
  "timestamp": "2025-01-19T..."
}
```

## 📚 Documentation

- [Documentation Molam](https://docs.molam.com)
- [Guide Quickstart](../quickstarts/node.md)
- [API Reference](https://docs.molam.com/api)

## 🤝 Support

- Email: support@molam.com
- Discord: [https://discord.gg/molam](https://discord.gg/molam)
- GitHub Issues: [https://github.com/molam/molam-connect/issues](https://github.com/molam/molam-connect/issues)

## 📄 Licence

MIT
