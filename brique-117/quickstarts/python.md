# Quickstart Python — Molam Connect

## Installation

```bash
pip install molam-sdk
```

## Configuration

```python
import molam

client = molam.Client('sk_test_your_api_key')
```

## Créer un paiement

```python
import molam

client = molam.Client('sk_test_your_api_key')

try:
    payment = client.payments.create({
        'amount': 5000,      # 5000 FCFA (50.00 XOF)
        'currency': 'XOF',
        'method': 'wallet',
        'customer': {
            'phone': '+221771234567',
            'name': 'Amadou Diallo'
        }
    })

    print(f"Paiement créé: {payment['id']}")
    print(f"Status: {payment['status']}")
except molam.ApiError as e:
    print(f"Erreur: {e.message}")
```

## Récupérer un paiement

```python
payment = client.payments.retrieve('pay_1234567890')
print(f"Montant: {payment['amount']} {payment['currency']}")
print(f"Status: {payment['status']}")
```

## Créer un remboursement

```python
refund = client.refunds.create({
    'payment_id': 'pay_1234567890',
    'reason': 'Demande du client'
})

print(f"Remboursement créé: {refund['id']}")
```

## Gérer les webhooks

```python
from flask import Flask, request, jsonify
import molam

app = Flask(__name__)
client = molam.Client('sk_test_your_api_key')

@app.route('/webhooks/molam', methods=['POST'])
def webhook():
    payload = request.get_data()
    signature = request.headers.get('Molam-Signature', '')

    # Vérifier la signature
    is_valid = client.webhooks.verify_signature(
        payload,
        signature,
        'whsec_your_webhook_secret'
    )

    if not is_valid:
        return jsonify({'error': 'Invalid signature'}), 400

    event = request.json

    # Traiter l'événement
    if event['type'] == 'payment.succeeded':
        print(f"Paiement réussi: {event['data']['id']}")
        # Mettre à jour votre base de données
    elif event['type'] == 'payment.failed':
        print(f"Paiement échoué: {event['data']['id']}")

    return jsonify({'received': True})

if __name__ == '__main__':
    app.run(port=3000)
```

## Exemple avec FastAPI

```python
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel
import molam
import os

app = FastAPI()
client = molam.Client(os.getenv('MOLAM_SECRET_KEY'))

class PaymentRequest(BaseModel):
    amount: int
    currency: str
    phone: str

@app.post('/create-payment')
async def create_payment(payment_req: PaymentRequest):
    try:
        payment = client.payments.create({
            'amount': payment_req.amount,
            'currency': payment_req.currency,
            'method': 'wallet',
            'customer': {
                'phone': payment_req.phone
            }
        })

        return {
            'payment_id': payment['id'],
            'status': payment['status']
        }
    except molam.ApiError as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get('/payment-status/{payment_id}')
async def get_payment_status(payment_id: str):
    try:
        payment = client.payments.retrieve(payment_id)
        return {'status': payment['status']}
    except molam.ApiError:
        raise HTTPException(status_code=404, detail='Payment not found')

@app.post('/webhooks/molam')
async def webhook(request: Request):
    payload = await request.body()
    signature = request.headers.get('molam-signature', '')

    if not client.webhooks.verify_signature(
        payload,
        signature,
        os.getenv('MOLAM_WEBHOOK_SECRET')
    ):
        raise HTTPException(status_code=400, detail='Invalid signature')

    event = await request.json()

    # Traiter l'événement
    # ...

    return {'received': True}
```

## Exemple avec Django

```python
# views.py
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.conf import settings
import molam
import json

client = molam.Client(settings.MOLAM_SECRET_KEY)

@require_http_methods(["POST"])
@csrf_exempt
def create_payment(request):
    data = json.loads(request.body)

    try:
        payment = client.payments.create({
            'amount': data['amount'],
            'currency': data['currency'],
            'method': 'wallet',
            'customer': {
                'phone': data['phone']
            }
        })

        return JsonResponse({
            'payment_id': payment['id'],
            'status': payment['status']
        })
    except molam.ApiError as e:
        return JsonResponse({'error': str(e)}, status=500)

@require_http_methods(["GET"])
def payment_status(request, payment_id):
    try:
        payment = client.payments.retrieve(payment_id)
        return JsonResponse({'status': payment['status']})
    except molam.ApiError:
        return JsonResponse({'error': 'Payment not found'}, status=404)

@require_http_methods(["POST"])
@csrf_exempt
def webhook(request):
    payload = request.body
    signature = request.META.get('HTTP_MOLAM_SIGNATURE', '')

    if not client.webhooks.verify_signature(
        payload,
        signature,
        settings.MOLAM_WEBHOOK_SECRET
    ):
        return JsonResponse({'error': 'Invalid signature'}, status=400)

    event = json.loads(payload)

    # Traiter l'événement
    # ...

    return JsonResponse({'received': True})
```

### Configuration Django

```python
# settings.py
MOLAM_SECRET_KEY = os.getenv('MOLAM_SECRET_KEY')
MOLAM_WEBHOOK_SECRET = os.getenv('MOLAM_WEBHOOK_SECRET')
```

```python
# urls.py
from django.urls import path
from . import views

urlpatterns = [
    path('create-payment/', views.create_payment),
    path('payment-status/<str:payment_id>/', views.payment_status),
    path('webhooks/molam/', views.webhook),
]
```

## Async/Await Support

```python
import molam
import asyncio

async_client = molam.AsyncClient('sk_test_your_api_key')

async def create_payment_async():
    payment = await async_client.payments.create({
        'amount': 5000,
        'currency': 'XOF',
        'method': 'wallet'
    })
    print(f"Paiement créé: {payment['id']}")

asyncio.run(create_payment_async())
```

## Variables d'environnement

```env
MOLAM_SECRET_KEY=sk_test_your_api_key
MOLAM_WEBHOOK_SECRET=whsec_your_webhook_secret
```

## Prochaines étapes

- [Documentation complète](https://docs.molam.com)
- [SDK Python Reference](https://docs.molam.com/sdk/python)
- [Exemples avancés](https://github.com/molam/examples)
