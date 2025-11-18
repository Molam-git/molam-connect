package client

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"math"
	"strconv"
	"strings"
	"time"
)

// MolamClient is the main SDK client
type MolamClient struct {
	http     *HttpClient
	Payments *PaymentsResource
	Refunds  *RefundsResource
	Webhooks *WebhooksResource
}

// ClientOptions contains configuration options for the Molam client
type ClientOptions struct {
	BaseURL    string
	APIKey     string
	TimeoutMS  int
	MaxRetries int
}

// NewClient creates a new Molam client instance
func NewClient(opts ClientOptions) (*MolamClient, error) {
	if opts.BaseURL == "" || opts.APIKey == "" {
		return nil, errors.New("baseURL and apiKey are required")
	}

	if opts.TimeoutMS == 0 {
		opts.TimeoutMS = 8000
	}
	if opts.MaxRetries == 0 {
		opts.MaxRetries = 3
	}

	httpClient := NewHttpClient(opts)

	client := &MolamClient{
		http: httpClient,
	}

	client.Payments = &PaymentsResource{http: httpClient}
	client.Refunds = &RefundsResource{http: httpClient}
	client.Webhooks = &WebhooksResource{http: httpClient}

	return client, nil
}

// VerifyWebhook verifies a webhook signature (static method)
func VerifyWebhook(rawBody []byte, sigHeader string, getSecret func(kid string) (string, error)) error {
	parts := make(map[string]string)
	for _, p := range strings.Split(sigHeader, ",") {
		kv := strings.SplitN(p, "=", 2)
		if len(kv) == 2 {
			parts[kv[0]] = kv[1]
		}
	}

	tstr, ok := parts["t"]
	v1, ok2 := parts["v1"]
	kid, ok3 := parts["kid"]

	if !ok || !ok2 || !ok3 {
		return errors.New("invalid signature header")
	}

	// Check timestamp
	t, err := strconv.ParseInt(tstr, 10, 64)
	if err != nil {
		return errors.New("invalid timestamp")
	}

	now := time.Now().UnixNano() / 1e6
	if math.Abs(float64(now-t)) > 5*60*1000 {
		return errors.New("timestamp outside tolerance")
	}

	// Get secret
	secret, err := getSecret(kid)
	if err != nil {
		return err
	}

	// Compute HMAC
	payload := tstr + "." + string(rawBody)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(payload))
	computed := hex.EncodeToString(mac.Sum(nil))

	// Constant-time comparison
	if !hmac.Equal([]byte(computed), []byte(v1)) {
		return errors.New("signature mismatch")
	}

	return nil
}
