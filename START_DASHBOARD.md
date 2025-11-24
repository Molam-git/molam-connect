# 🚀 Démarrer le Dashboard Molam Connect

## Étapes rapides

### 1. Démarrer le serveur

```powershell
# Dans le dossier molam-connect
npm start
```

Vous devriez voir :
```
✅ Database connected: ...
✅ Redis connected
✅ Server running on http://0.0.0.0:3000
✅ RBAC (Brique 68) initialized
```

### 2. Ouvrir le dashboard dans votre navigateur

```
http://localhost:3000
```

### 3. Tester les fonctionnalités

**Onglets qui fonctionnent maintenant :**
- ✅ **Payment Intent** - Créer et confirmer des paiements
- ✅ **Auth Decision** - Tester les décisions d'authentification SIRA
- ✅ **OTP** - Générer et vérifier des codes OTP
- ✅ **Customer** - Créer des clients
- ✅ **Logs** - Voir l'activité en temps réel
- ✅ **Checkout Demo** - Page de paiement complète
- ✅ **Offline (QR+USSD)** - Paiements offline
- ✅ **Ma Wallet (149a)** - Portefeuille numérique
- ✅ **Merchant (149b)** - Dashboard marchand

## ❌ Si vous avez encore des erreurs

### Problème : Erreur 500 sur les APIs

**Causes possibles :**
1. PostgreSQL n'est pas démarré
2. Redis n'est pas démarré
3. La base de données `molam_connect` n'existe pas

**Solutions :**

**Vérifier PostgreSQL :**
```powershell
# Tester la connexion
psql -U postgres -d molam_connect -c "SELECT 1"
```

**Vérifier Redis :**
```powershell
# Si Redis n'est pas installé, installez-le ou utilisez Docker
docker run -d -p 6379:6379 redis:latest
```

**Créer la base de données si nécessaire :**
```powershell
createdb -U postgres molam_connect
```

### Problème : Port 3000 déjà utilisé

```powershell
# Utiliser un autre port
$env:PORT=3001
npm start
```

Puis ouvrez : http://localhost:3001

## 🧪 Tester une API manuellement

```powershell
# Test Payment Intent
curl -X POST http://localhost:3000/api/v1/payment_intents `
  -H "Content-Type: application/json" `
  -d '{"amount": 10000, "currency": "XOF", "description": "Test"}'

# Test Health Check
curl http://localhost:3000/health
```

## 📊 Logs du serveur

Les logs montrent :
- ✅ Connexions DB/Redis
- 📝 Requêtes HTTP
- ⚠️ Erreurs éventuelles

Si vous voyez des erreurs dans les logs, partagez-les pour diagnostic.

## 🎯 URLs importantes

| Service | URL |
|---------|-----|
| Dashboard principal | http://localhost:3000 |
| Health Check | http://localhost:3000/health |
| Checkout Demo | http://localhost:3000/checkout.html |
| Ma Wallet (149a) | http://localhost:3000/wallet.html |
| Merchant Dashboard (149b) | http://localhost:3000/merchant-dashboard.html |
| Offline Payments | http://localhost:3000/offline.html |

## ✨ Tout fonctionne ?

Vous devriez voir dans votre navigateur :
- Badge vert "Server Online" en haut à droite
- Tous les onglets cliquables
- Formulaires de test fonctionnels
- Logs d'activité en temps réel

**Bon test ! 🚀**