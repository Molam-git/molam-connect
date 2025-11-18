/// Example Flutter app demonstrating Molam Form integration

import 'package:flutter/material.dart';
import 'molam_form.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Molam Form Example',
      theme: ThemeData(
        primarySwatch: Colors.blue,
        visualDensity: VisualDensity.adaptivePlatformDensity,
      ),
      home: const CheckoutPage(),
    );
  }
}

class CheckoutPage extends StatefulWidget {
  const CheckoutPage({Key? key}) : super(key: key);

  @override
  State<CheckoutPage> createState() => _CheckoutPageState();
}

class _CheckoutPageState extends State<CheckoutPage> {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Molam Checkout'),
        centerTitle: true,
      ),
      body: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 20),

              // Test cards info
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.amber[50],
                  border: Border.all(color: Colors.amber[200]!),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Test Cards',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: Colors.amber[900],
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text('Success: 4242 4242 4242 4242'),
                    const Text('Decline: 4000 0000 0000 0002'),
                    const Text('Expiry: Any future date (e.g., 12/25)'),
                    const Text('CVC: Any 3 digits (e.g., 123)'),
                  ],
                ),
              ),
              const SizedBox(height: 20),

              // Molam Checkout Widget
              MolamCheckout(
                publishableKey: 'pk_test_1234567890abcdef',
                amount: 49.99,
                currency: 'USD',
                customerEmail: 'demo@molam.com',
                customerName: 'Demo User',
                description: 'Premium Subscription',
                primaryColor: const Color(0xFF5469D4),
                onSuccess: (result) {
                  _showSuccessDialog(result);
                },
                onError: (error) {
                  _showErrorDialog(error);
                },
              ),
              const SizedBox(height: 20),

              // Additional examples
              const Divider(),
              const SizedBox(height: 20),
              Text(
                'Programmatic Usage Example',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 10),
              ElevatedButton(
                onPressed: _testProgrammaticAPI,
                child: const Text('Test Programmatic Payment'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showSuccessDialog(Map<String, dynamic> result) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.check_circle, color: Colors.green, size: 32),
            SizedBox(width: 10),
            Text('Payment Successful'),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Transaction ID: ${result['intent_reference']}'),
            Text('Amount: ${result['amount']} ${result['currency']}'),
            Text('Status: ${result['status']}'),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  void _showErrorDialog(String error) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.error, color: Colors.red, size: 32),
            SizedBox(width: 10),
            Text('Payment Failed'),
          ],
        ),
        content: Text(error),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  Future<void> _testProgrammaticAPI() async {
    try {
      // Initialize SDK
      final molam = MolamSDK('pk_test_1234567890abcdef');

      // Show loading
      showDialog(
        context: context,
        barrierDismissible: false,
        builder: (context) => const Center(
          child: Card(
            child: Padding(
              padding: EdgeInsets.all(20.0),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  CircularProgressIndicator(),
                  SizedBox(height: 16),
                  Text('Processing payment...'),
                ],
              ),
            ),
          ),
        ),
      );

      // Create payment intent
      final intent = await molam.createPaymentIntent(
        amount: 100.00,
        currency: 'USD',
        customerEmail: 'test@molam.com',
        description: 'Test Payment',
      );

      // Tokenize card (using test card)
      final paymentMethod = await molam.tokenizePaymentMethod(
        cardNumber: '4242424242424242',
        expMonth: '12',
        expYear: '2025',
        cvc: '123',
        cardholderName: 'Test User',
      );

      // Confirm payment
      final result = await molam.confirmPaymentIntent(
        intent['intent_reference'],
        paymentMethod['token'],
      );

      // Close loading
      if (mounted) Navigator.of(context).pop();

      // Show success
      _showSuccessDialog(result);

      // Cleanup
      molam.dispose();
    } catch (e) {
      // Close loading
      if (mounted) Navigator.of(context).pop();

      // Show error
      _showErrorDialog(e.toString());
    }
  }
}
