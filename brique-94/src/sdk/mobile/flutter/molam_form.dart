/// Molam Form Core - Flutter SDK
/// Universal payment widget for mobile integration (iOS & Android)
///
/// Usage:
/// ```dart
/// MolamCheckout(
///   publishableKey: 'pk_test_xxx',
///   amount: 99.99,
///   currency: 'USD',
///   customerEmail: 'customer@example.com',
///   onSuccess: (result) => print('Payment successful: $result'),
///   onError: (error) => print('Payment failed: $error'),
/// )
/// ```

library molam_form;

import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

const String SDK_VERSION = '1.0.0';
const String API_BASE_URL = 'https://api.molam.com/form';

/// Molam SDK Client
class MolamSDK {
  final String publishableKey;
  final String environment;
  final http.Client _client = http.Client();

  MolamSDK(this.publishableKey)
      : environment = publishableKey.startsWith('pk_test_') ? 'test' : 'live' {
    if (!publishableKey.startsWith('pk_')) {
      throw ArgumentError('Invalid publishable key. Must start with "pk_"');
    }
  }

  /// Create a payment intent
  Future<Map<String, dynamic>> createPaymentIntent({
    required double amount,
    required String currency,
    String? customerEmail,
    String? customerName,
    String? description,
    Map<String, dynamic>? metadata,
  }) async {
    final response = await _client.post(
      Uri.parse('$API_BASE_URL/payment-intents'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $publishableKey',
      },
      body: jsonEncode({
        'amount': amount,
        'currency': currency.toUpperCase(),
        'customer_email': customerEmail,
        'customer_name': customerName,
        'description': description,
        'metadata': metadata ?? {},
      }),
    );

    if (response.statusCode != 201) {
      final error = jsonDecode(response.body);
      throw Exception(error['message'] ?? 'Failed to create payment intent');
    }

    final intent = jsonDecode(response.body);
    await _logEvent('intent_created', {'intent_reference': intent['intent_reference']});
    return intent;
  }

  /// Confirm a payment intent
  Future<Map<String, dynamic>> confirmPaymentIntent(
    String intentId,
    String paymentMethodToken,
  ) async {
    final response = await _client.patch(
      Uri.parse('$API_BASE_URL/payment-intents/$intentId'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $publishableKey',
      },
      body: jsonEncode({
        'action': 'confirm',
        'payment_method_token': paymentMethodToken,
      }),
    );

    if (response.statusCode != 200) {
      final error = jsonDecode(response.body);
      throw Exception(error['message'] ?? 'Failed to confirm payment intent');
    }

    final intent = jsonDecode(response.body);
    await _logEvent('intent_confirmed', {'intent_reference': intent['intent_reference']});
    return intent;
  }

  /// Tokenize payment method (mock - in production use platform channels)
  Future<Map<String, dynamic>> tokenizePaymentMethod({
    required String cardNumber,
    required String expMonth,
    required String expYear,
    required String cvc,
    required String cardholderName,
  }) async {
    // Mock tokenization - in production, use native SDKs or platform channels
    final token = 'pm_${environment}_${DateTime.now().millisecondsSinceEpoch}_${_generateRandomString(9)}';
    final last4 = cardNumber.substring(cardNumber.length - 4);
    final brand = _detectCardBrand(cardNumber);

    await _logEvent('payment_method_tokenized', {
      'token_prefix': token.substring(0, 10),
      'card_last4': last4,
      'brand': brand,
    });

    return {
      'token': token,
      'card': {
        'last4': last4,
        'brand': brand,
        'exp_month': expMonth,
        'exp_year': expYear,
      },
    };
  }

  /// Log telemetry event
  Future<void> _logEvent(String eventType, Map<String, dynamic> payload) async {
    try {
      await _client.post(
        Uri.parse('$API_BASE_URL/logs'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $publishableKey',
        },
        body: jsonEncode({
          'event_type': eventType,
          'sdk_version': SDK_VERSION,
          'platform': 'flutter',
          'payload': payload,
        }),
      );
    } catch (e) {
      // Silent fail for logging
      debugPrint('Failed to log event: $e');
    }
  }

  /// Detect card brand from number
  String _detectCardBrand(String number) {
    if (number.startsWith('4')) return 'visa';
    if (RegExp(r'^5[1-5]').hasMatch(number)) return 'mastercard';
    if (RegExp(r'^3[47]').hasMatch(number)) return 'amex';
    if (RegExp(r'^6(?:011|5)').hasMatch(number)) return 'discover';
    return 'unknown';
  }

  String _generateRandomString(int length) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    return List.generate(length, (index) => chars[DateTime.now().millisecond % chars.length]).join();
  }

  void dispose() {
    _client.close();
  }
}

/// Molam Checkout Widget
class MolamCheckout extends StatefulWidget {
  final String publishableKey;
  final double amount;
  final String currency;
  final String? customerEmail;
  final String? customerName;
  final String? description;
  final Function(Map<String, dynamic>) onSuccess;
  final Function(String) onError;
  final Color? primaryColor;

  const MolamCheckout({
    Key? key,
    required this.publishableKey,
    required this.amount,
    required this.currency,
    required this.onSuccess,
    required this.onError,
    this.customerEmail,
    this.customerName,
    this.description,
    this.primaryColor,
  }) : super(key: key);

  @override
  State<MolamCheckout> createState() => _MolamCheckoutState();
}

class _MolamCheckoutState extends State<MolamCheckout> {
  late MolamSDK _sdk;
  Map<String, dynamic>? _paymentIntent;
  bool _isLoading = true;
  bool _isProcessing = false;
  String? _errorMessage;
  bool _paymentSuccessful = false;

  final _formKey = GlobalKey<FormState>();
  final _cardNumberController = TextEditingController();
  final _expiryController = TextEditingController();
  final _cvcController = TextEditingController();
  final _nameController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _sdk = MolamSDK(widget.publishableKey);
    _initializePayment();
  }

  @override
  void dispose() {
    _cardNumberController.dispose();
    _expiryController.dispose();
    _cvcController.dispose();
    _nameController.dispose();
    _sdk.dispose();
    super.dispose();
  }

  Future<void> _initializePayment() async {
    try {
      final intent = await _sdk.createPaymentIntent(
        amount: widget.amount,
        currency: widget.currency,
        customerEmail: widget.customerEmail,
        customerName: widget.customerName,
        description: widget.description ?? 'Payment of ${widget.amount} ${widget.currency}',
      );

      setState(() {
        _paymentIntent = intent;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _errorMessage = 'Failed to initialize payment: ${e.toString()}';
        _isLoading = false;
      });
      widget.onError(_errorMessage!);
    }
  }

  Future<void> _handlePayment() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _isProcessing = true;
      _errorMessage = null;
    });

    try {
      // Tokenize payment method
      final cardNumber = _cardNumberController.text.replaceAll(' ', '');
      final expiry = _expiryController.text.split('/');
      final paymentMethod = await _sdk.tokenizePaymentMethod(
        cardNumber: cardNumber,
        expMonth: expiry[0].trim(),
        expYear: '20${expiry[1].trim()}',
        cvc: _cvcController.text,
        cardholderName: _nameController.text,
      );

      // Confirm payment intent
      final result = await _sdk.confirmPaymentIntent(
        _paymentIntent!['intent_reference'],
        paymentMethod['token'],
      );

      setState(() {
        _paymentSuccessful = true;
        _isProcessing = false;
      });

      widget.onSuccess(result);
    } catch (e) {
      setState(() {
        _errorMessage = e.toString().replaceAll('Exception: ', '');
        _isProcessing = false;
      });
      widget.onError(_errorMessage!);
    }
  }

  @override
  Widget build(BuildContext context) {
    final primaryColor = widget.primaryColor ?? const Color(0xFF5469D4);

    if (_isLoading) {
      return _buildLoadingState();
    }

    if (_paymentSuccessful) {
      return _buildSuccessState(primaryColor);
    }

    return Card(
      elevation: 4,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              // Header
              Text(
                _formatAmount(widget.amount, widget.currency),
                style: const TextStyle(
                  fontSize: 32,
                  fontWeight: FontWeight.bold,
                ),
                textAlign: TextAlign.center,
              ),
              if (widget.description != null) ...[
                const SizedBox(height: 8),
                Text(
                  widget.description!,
                  style: TextStyle(
                    fontSize: 14,
                    color: Colors.grey[600],
                  ),
                  textAlign: TextAlign.center,
                ),
              ],
              const SizedBox(height: 24),

              // Error message
              if (_errorMessage != null) ...[
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.red[50],
                    border: Border.all(color: Colors.red[200]!),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    _errorMessage!,
                    style: const TextStyle(color: Colors.red),
                  ),
                ),
                const SizedBox(height: 16),
              ],

              // Card number
              TextFormField(
                controller: _cardNumberController,
                decoration: InputDecoration(
                  labelText: 'Card Number',
                  hintText: '4242 4242 4242 4242',
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                  prefixIcon: const Icon(Icons.credit_card),
                ),
                keyboardType: TextInputType.number,
                maxLength: 19,
                onChanged: (value) {
                  final formatted = _formatCardNumber(value);
                  if (formatted != value) {
                    _cardNumberController.value = TextEditingValue(
                      text: formatted,
                      selection: TextSelection.collapsed(offset: formatted.length),
                    );
                  }
                },
                validator: (value) {
                  if (value == null || value.isEmpty) {
                    return 'Card number is required';
                  }
                  final digits = value.replaceAll(' ', '');
                  if (digits.length < 13 || digits.length > 19) {
                    return 'Invalid card number';
                  }
                  if (!_validateLuhn(digits)) {
                    return 'Invalid card number';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 16),

              // Expiry and CVC
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _expiryController,
                      decoration: InputDecoration(
                        labelText: 'Expiry (MM/YY)',
                        hintText: '12/25',
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                      keyboardType: TextInputType.number,
                      maxLength: 5,
                      onChanged: (value) {
                        if (value.length == 2 && !value.contains('/')) {
                          _expiryController.text = '$value/';
                          _expiryController.selection = TextSelection.fromPosition(
                            TextPosition(offset: _expiryController.text.length),
                          );
                        }
                      },
                      validator: (value) {
                        if (value == null || value.isEmpty) {
                          return 'Expiry is required';
                        }
                        if (!RegExp(r'^\d{2}/\d{2}$').hasMatch(value)) {
                          return 'Invalid format (MM/YY)';
                        }
                        return null;
                      },
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: TextFormField(
                      controller: _cvcController,
                      decoration: InputDecoration(
                        labelText: 'CVC',
                        hintText: '123',
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                      keyboardType: TextInputType.number,
                      maxLength: 4,
                      obscureText: true,
                      validator: (value) {
                        if (value == null || value.isEmpty) {
                          return 'CVC is required';
                        }
                        if (value.length < 3) {
                          return 'Invalid CVC';
                        }
                        return null;
                      },
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),

              // Cardholder name
              TextFormField(
                controller: _nameController,
                decoration: InputDecoration(
                  labelText: 'Cardholder Name',
                  hintText: 'John Doe',
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                  prefixIcon: const Icon(Icons.person),
                ),
                textCapitalization: TextCapitalization.words,
                validator: (value) {
                  if (value == null || value.isEmpty) {
                    return 'Cardholder name is required';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 24),

              // Submit button
              ElevatedButton(
                onPressed: _isProcessing ? null : _handlePayment,
                style: ElevatedButton.styleFrom(
                  backgroundColor: primaryColor,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  elevation: 2,
                ),
                child: _isProcessing
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                        ),
                      )
                    : Text(
                        'Pay ${_formatAmount(widget.amount, widget.currency)}',
                        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                      ),
              ),
              const SizedBox(height: 16),

              // Footer
              Text(
                'Powered by Molam',
                style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildLoadingState() {
    return const Card(
      elevation: 4,
      child: Padding(
        padding: EdgeInsets.all(48.0),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(),
            SizedBox(height: 16),
            Text('Initializing payment...'),
          ],
        ),
      ),
    );
  }

  Widget _buildSuccessState(Color primaryColor) {
    return Card(
      elevation: 4,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(48.0),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.check_circle, color: primaryColor, size: 64),
            const SizedBox(height: 16),
            const Text(
              'Payment Successful!',
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Text(
              'Transaction ID: ${_paymentIntent!['intent_reference']}',
              style: TextStyle(fontSize: 14, color: Colors.grey[600]),
            ),
          ],
        ),
      ),
    );
  }

  String _formatAmount(double amount, String currency) {
    return '$currency ${amount.toStringAsFixed(2)}';
  }

  String _formatCardNumber(String value) {
    final digits = value.replaceAll(' ', '');
    final buffer = StringBuffer();
    for (int i = 0; i < digits.length; i++) {
      if (i > 0 && i % 4 == 0) buffer.write(' ');
      buffer.write(digits[i]);
    }
    return buffer.toString();
  }

  bool _validateLuhn(String number) {
    int sum = 0;
    bool isEven = false;

    for (int i = number.length - 1; i >= 0; i--) {
      int digit = int.parse(number[i]);

      if (isEven) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }

      sum += digit;
      isEven = !isEven;
    }

    return sum % 10 == 0;
  }
}
