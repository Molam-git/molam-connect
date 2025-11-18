"""
mTLS Configuration Example

For sensitive operations (bank connectors, treasury operations),
mTLS (mutual TLS) provides additional security.
"""

import os
from molam_sdk import MolamClient, ClientConfig, PaymentIntentCreate


def main():
    # Configure client with mTLS
    config = ClientConfig(
        api_key=os.getenv("MOLAM_API_KEY"),
        base_url="https://api.molam.io",  # Production endpoint
        mtls_cert="/path/to/client-cert.pem",  # Client certificate
        mtls_key="/path/to/client-key.pem",  # Client private key
        verify_ssl=True,  # Always verify SSL in production
    )

    client = MolamClient(config)

    # All requests will now use mTLS
    print("Creating payment with mTLS authentication...")
    payment_intent = client.create_payment_intent(
        PaymentIntentCreate(amount=1000.00, currency="USD", description="High-value transaction"),
        idempotency_key="secure-payment-001",
    )

    print(f"✓ Secure payment created: {payment_intent.id}")
    print("  All communications encrypted with mutual TLS")


if __name__ == "__main__":
    print("mTLS Example")
    print("=" * 50)
    print("\nSetup Instructions:")
    print("1. Obtain client certificate and key from Molam")
    print("2. Store securely (NOT in version control)")
    print("3. Configure paths in ClientConfig")
    print("4. Certificates should be rotated quarterly")
    print("\n" + "=" * 50)

    # main()  # Uncomment when certificates are configured
