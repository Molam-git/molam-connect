# docs/api_qr_payments.md
# API QR Dynamique - Documentation

## Endpoints

### POST /api/pay/qr/generate
Génère un QR code dynamique

### POST /api/pay/qr/scan  
Scan et validation d'un QR code

### POST /api/pay/qr/confirm
Confirmation du paiement

## Sécurité
- Signature HMAC-SHA256
- TTL: 2 minutes par défaut
- Rate limiting via Redis