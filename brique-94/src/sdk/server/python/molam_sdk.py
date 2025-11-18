"""
Molam Form Core - Python Server SDK
For server-side payment intent creation and management

Usage:
    from molam_sdk import MolamSDK
    molam = MolamSDK('sk_test_xxx')

    intent = molam.payment_intents.create(
        amount=100.00,
        currency='USD',
        customer_email='customer@example.com'
    )
"""

import requests
import json
from typing import Optional, Dict, Any, List

SDK_VERSION = '1.0.0'
API_BASE_URL = 'https://api.molam.com/form'


class MolamException(Exception):
    """Custom exception for Molam API errors"""

    def __init__(self, message: str, status_code: Optional[int] = None, code: Optional[str] = None):
        super().__init__(message)
        self.status_code = status_code
        self.code = code


class MolamSDK:
    """Main Molam SDK class"""

    def __init__(self, api_key: str, **options):
        if not api_key or not api_key.startswith('sk_'):
            raise ValueError('Invalid API key. Must be a secret key starting with "sk_"')

        self.api_key = api_key
        self.environment = 'test' if api_key.startswith('sk_test_') else 'live'
        self.base_url = options.get('base_url', API_BASE_URL)
        self.timeout = options.get('timeout', 30)

        # Initialize resource handlers
        self.payment_intents = PaymentIntents(self)
        self.api_keys = ApiKeys(self)
        self.logs = Logs(self)

    def request(self, method: str, path: str, data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Make HTTP request to Molam API"""
        url = f'{self.base_url}{path}'

        headers = {
            'Authorization': f'Bearer {self.api_key}',
            'Content-Type': 'application/json',
            'User-Agent': f'Molam Python SDK/{SDK_VERSION}',
        }

        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=self.timeout)
            elif method == 'POST':
                response = requests.post(url, headers=headers, json=data, timeout=self.timeout)
            elif method == 'PATCH':
                response = requests.patch(url, headers=headers, json=data, timeout=self.timeout)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=self.timeout)
            else:
                raise ValueError(f'Unsupported HTTP method: {method}')

            # Parse JSON response
            try:
                json_response = response.json()
            except json.JSONDecodeError:
                raise MolamException('Invalid JSON response', response.status_code, 'parse_error')

            # Check for errors
            if response.status_code < 200 or response.status_code >= 300:
                raise MolamException(
                    json_response.get('message', 'API request failed'),
                    response.status_code,
                    json_response.get('error')
                )

            return json_response

        except requests.exceptions.Timeout:
            raise MolamException('Request timeout', None, 'timeout')
        except requests.exceptions.RequestException as e:
            raise MolamException(f'Network error: {str(e)}', None, 'network_error')


class PaymentIntents:
    """Payment Intents Resource"""

    def __init__(self, sdk: MolamSDK):
        self.sdk = sdk

    def create(
        self,
        amount: float,
        currency: str,
        customer_email: Optional[str] = None,
        customer_name: Optional[str] = None,
        description: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        payment_method_type: Optional[str] = None,
        return_url: Optional[str] = None
    ) -> Dict[str, Any]:
        """Create a payment intent"""
        if not amount or amount <= 0:
            raise ValueError('amount must be a positive number')

        if not currency:
            raise ValueError('currency is required')

        return self.sdk.request('POST', '/payment-intents', {
            'amount': amount,
            'currency': currency.upper(),
            'customer_email': customer_email,
            'customer_name': customer_name,
            'description': description,
            'metadata': metadata or {},
            'payment_method_type': payment_method_type,
            'return_url': return_url
        })

    def retrieve(self, intent_id: str) -> Dict[str, Any]:
        """Retrieve a payment intent"""
        if not intent_id:
            raise ValueError('intent_id is required')

        return self.sdk.request('GET', f'/payment-intents/{intent_id}')

    def update(self, intent_id: str, action: str, payment_method_token: Optional[str] = None) -> Dict[str, Any]:
        """Update a payment intent"""
        if not intent_id:
            raise ValueError('intent_id is required')

        if not action:
            raise ValueError('action is required (confirm, capture, cancel)')

        return self.sdk.request('PATCH', f'/payment-intents/{intent_id}', {
            'action': action,
            'payment_method_token': payment_method_token
        })

    def confirm(self, intent_id: str, payment_method_token: str) -> Dict[str, Any]:
        """Confirm a payment intent"""
        return self.update(intent_id, 'confirm', payment_method_token)

    def capture(self, intent_id: str) -> Dict[str, Any]:
        """Capture a payment intent"""
        return self.update(intent_id, 'capture')

    def cancel(self, intent_id: str) -> Dict[str, Any]:
        """Cancel a payment intent"""
        return self.update(intent_id, 'cancel')


class ApiKeys:
    """API Keys Resource"""

    def __init__(self, sdk: MolamSDK):
        self.sdk = sdk

    def create(self, merchant_id: str, key_type: str, environment: str) -> Dict[str, Any]:
        """Generate a new API key"""
        if not merchant_id or not key_type or not environment:
            raise ValueError('merchant_id, key_type, and environment are required')

        return self.sdk.request('POST', '/api-keys', {
            'merchant_id': merchant_id,
            'key_type': key_type,
            'environment': environment
        })

    def list(self, merchant_id: str) -> Dict[str, Any]:
        """List API keys"""
        if not merchant_id:
            raise ValueError('merchant_id is required')

        return self.sdk.request('GET', f'/api-keys?merchant_id={merchant_id}')

    def revoke(self, key_id: str) -> Dict[str, Any]:
        """Revoke an API key"""
        if not key_id:
            raise ValueError('key_id is required')

        return self.sdk.request('DELETE', f'/api-keys/{key_id}')


class Logs:
    """Logs Resource"""

    def __init__(self, sdk: MolamSDK):
        self.sdk = sdk

    def create(
        self,
        event_type: str,
        sdk_version: Optional[str] = None,
        platform: Optional[str] = None,
        payload: Optional[Dict[str, Any]] = None,
        intent_reference: Optional[str] = None
    ) -> Dict[str, Any]:
        """Create a log entry"""
        if not event_type:
            raise ValueError('event_type is required')

        return self.sdk.request('POST', '/logs', {
            'event_type': event_type,
            'sdk_version': sdk_version or SDK_VERSION,
            'platform': platform or 'python',
            'payload': payload or {},
            'intent_reference': intent_reference
        })

    def list(
        self,
        merchant_id: str,
        limit: int = 100,
        offset: int = 0,
        event_type: Optional[str] = None
    ) -> Dict[str, Any]:
        """List logs for a merchant"""
        if not merchant_id:
            raise ValueError('merchant_id is required')

        query_params = f'merchant_id={merchant_id}&limit={limit}&offset={offset}'
        if event_type:
            query_params += f'&event_type={event_type}'

        return self.sdk.request('GET', f'/logs?{query_params}')
