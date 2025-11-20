# Quickstart PHP — Molam Connect

## Installation

```bash
composer require molam/molam-php
```

## Configuration

```php
<?php
require_once 'vendor/autoload.php';

$molam = new \Molam\Client('sk_test_your_api_key');
```

## Créer un paiement

```php
<?php
require_once 'vendor/autoload.php';

$molam = new \Molam\Client('sk_test_your_api_key');

try {
    $payment = $molam->payments->create([
        'amount' => 5000,      // 5000 FCFA (50.00 XOF)
        'currency' => 'XOF',
        'method' => 'wallet',
        'customer' => [
            'phone' => '+221771234567',
            'name' => 'Amadou Diallo'
        ]
    ]);

    echo "Paiement créé: " . $payment->id . "\n";
    echo "Status: " . $payment->status . "\n";
} catch (\Molam\Exception\ApiException $e) {
    echo "Erreur: " . $e->getMessage() . "\n";
}
```

## Récupérer un paiement

```php
<?php
$payment = $molam->payments->retrieve('pay_1234567890');
echo "Montant: " . $payment->amount . " " . $payment->currency . "\n";
echo "Status: " . $payment->status . "\n";
```

## Créer un remboursement

```php
<?php
$refund = $molam->refunds->create([
    'payment_id' => 'pay_1234567890',
    'reason' => 'Demande du client'
]);

echo "Remboursement créé: " . $refund->id . "\n";
```

## Gérer les webhooks

```php
<?php
require_once 'vendor/autoload.php';

$molam = new \Molam\Client('sk_test_your_api_key');

// Récupérer le payload et la signature
$payload = file_get_contents('php://input');
$signature = $_SERVER['HTTP_MOLAM_SIGNATURE'] ?? '';

// Vérifier la signature
$isValid = $molam->webhooks->verifySignature(
    $payload,
    $signature,
    'whsec_your_webhook_secret'
);

if (!$isValid) {
    http_response_code(400);
    exit('Invalid signature');
}

$event = json_decode($payload);

// Traiter l'événement
switch ($event->type) {
    case 'payment.succeeded':
        echo "Paiement réussi: " . $event->data->id . "\n";
        // Mettre à jour votre base de données
        break;

    case 'payment.failed':
        echo "Paiement échoué: " . $event->data->id . "\n";
        break;
}

http_response_code(200);
echo json_encode(['received' => true]);
```

## Exemple avec Laravel

```php
<?php
namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Molam\Client as MolamClient;

class PaymentController extends Controller
{
    private $molam;

    public function __construct()
    {
        $this->molam = new MolamClient(config('services.molam.secret'));
    }

    public function create(Request $request)
    {
        $validated = $request->validate([
            'amount' => 'required|integer|min:100',
            'currency' => 'required|in:XOF,EUR,USD',
            'phone' => 'required|string',
        ]);

        try {
            $payment = $this->molam->payments->create([
                'amount' => $validated['amount'],
                'currency' => $validated['currency'],
                'method' => 'wallet',
                'customer' => [
                    'phone' => $validated['phone']
                ]
            ]);

            return response()->json([
                'payment_id' => $payment->id,
                'status' => $payment->status
            ]);
        } catch (\Molam\Exception\ApiException $e) {
            return response()->json([
                'error' => $e->getMessage()
            ], 500);
        }
    }

    public function status($id)
    {
        try {
            $payment = $this->molam->payments->retrieve($id);
            return response()->json(['status' => $payment->status]);
        } catch (\Molam\Exception\ApiException $e) {
            return response()->json(['error' => 'Payment not found'], 404);
        }
    }

    public function webhook(Request $request)
    {
        $payload = $request->getContent();
        $signature = $request->header('Molam-Signature');

        if (!$this->molam->webhooks->verifySignature($payload, $signature, config('services.molam.webhook_secret'))) {
            return response()->json(['error' => 'Invalid signature'], 400);
        }

        $event = json_decode($payload);

        // Traiter l'événement
        // ...

        return response()->json(['received' => true]);
    }
}
```

### Configuration Laravel

```php
// config/services.php
return [
    'molam' => [
        'secret' => env('MOLAM_SECRET_KEY'),
        'webhook_secret' => env('MOLAM_WEBHOOK_SECRET'),
    ],
];
```

```env
# .env
MOLAM_SECRET_KEY=sk_test_your_api_key
MOLAM_WEBHOOK_SECRET=whsec_your_webhook_secret
```

## Prochaines étapes

- [Documentation complète](https://docs.molam.com)
- [SDK PHP Reference](https://docs.molam.com/sdk/php)
- [WooCommerce Plugin](https://docs.molam.com/plugins/woocommerce)
