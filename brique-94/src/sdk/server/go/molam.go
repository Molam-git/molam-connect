// Package molam provides a Go SDK for the Molam Form Core API
// For server-side payment intent creation and management
//
// Usage:
//
//	client := molam.NewClient("sk_test_xxx")
//	intent, err := client.PaymentIntents.Create(&molam.PaymentIntentParams{
//	    Amount:        100.00,
//	    Currency:      "USD",
//	    CustomerEmail: "customer@example.com",
//	})
package molam

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	SDKVersion  = "1.0.0"
	APIBaseURL  = "https://api.molam.com/form"
	DefaultTimeout = 30 * time.Second
)

// MolamError represents an error from the Molam API
type MolamError struct {
	Message    string
	StatusCode int
	Code       string
}

func (e *MolamError) Error() string {
	return fmt.Sprintf("molam: %s (status: %d, code: %s)", e.Message, e.StatusCode, e.Code)
}

// Client is the main Molam SDK client
type Client struct {
	APIKey         string
	Environment    string
	BaseURL        string
	HTTPClient     *http.Client
	PaymentIntents *PaymentIntentsResource
	APIKeys        *APIKeysResource
	Logs           *LogsResource
}

// NewClient creates a new Molam client
func NewClient(apiKey string, options ...ClientOption) (*Client, error) {
	if apiKey == "" || !strings.HasPrefix(apiKey, "sk_") {
		return nil, fmt.Errorf("invalid API key: must be a secret key starting with 'sk_'")
	}

	environment := "live"
	if strings.HasPrefix(apiKey, "sk_test_") {
		environment = "test"
	}

	client := &Client{
		APIKey:      apiKey,
		Environment: environment,
		BaseURL:     APIBaseURL,
		HTTPClient: &http.Client{
			Timeout: DefaultTimeout,
		},
	}

	// Apply options
	for _, option := range options {
		option(client)
	}

	// Initialize resources
	client.PaymentIntents = &PaymentIntentsResource{client: client}
	client.APIKeys = &APIKeysResource{client: client}
	client.Logs = &LogsResource{client: client}

	return client, nil
}

// ClientOption is a function that configures a Client
type ClientOption func(*Client)

// WithBaseURL sets a custom base URL
func WithBaseURL(baseURL string) ClientOption {
	return func(c *Client) {
		c.BaseURL = baseURL
	}
}

// WithTimeout sets a custom timeout
func WithTimeout(timeout time.Duration) ClientOption {
	return func(c *Client) {
		c.HTTPClient.Timeout = timeout
	}
}

// request makes an HTTP request to the Molam API
func (c *Client) request(method, path string, body interface{}) (map[string]interface{}, error) {
	url := c.BaseURL + path

	var reqBody io.Reader
	if body != nil {
		jsonData, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal request body: %w", err)
		}
		reqBody = bytes.NewReader(jsonData)
	}

	req, err := http.NewRequest(method, url, reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+c.APIKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "Molam Go SDK/"+SDKVersion)

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, &MolamError{
			Message: fmt.Sprintf("network error: %v", err),
			Code:    "network_error",
		}
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	var result map[string]interface{}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, &MolamError{
			Message:    "invalid JSON response",
			StatusCode: resp.StatusCode,
			Code:       "parse_error",
		}
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		message := "API request failed"
		code := ""
		if msg, ok := result["message"].(string); ok {
			message = msg
		}
		if c, ok := result["error"].(string); ok {
			code = c
		}
		return nil, &MolamError{
			Message:    message,
			StatusCode: resp.StatusCode,
			Code:       code,
		}
	}

	return result, nil
}

// PaymentIntentsResource handles payment intent operations
type PaymentIntentsResource struct {
	client *Client
}

// PaymentIntentParams contains parameters for creating a payment intent
type PaymentIntentParams struct {
	Amount            float64                `json:"amount"`
	Currency          string                 `json:"currency"`
	CustomerEmail     string                 `json:"customer_email,omitempty"`
	CustomerName      string                 `json:"customer_name,omitempty"`
	Description       string                 `json:"description,omitempty"`
	Metadata          map[string]interface{} `json:"metadata,omitempty"`
	PaymentMethodType string                 `json:"payment_method_type,omitempty"`
	ReturnURL         string                 `json:"return_url,omitempty"`
}

// Create creates a new payment intent
func (r *PaymentIntentsResource) Create(params *PaymentIntentParams) (map[string]interface{}, error) {
	if params.Amount <= 0 {
		return nil, fmt.Errorf("amount must be a positive number")
	}
	if params.Currency == "" {
		return nil, fmt.Errorf("currency is required")
	}

	params.Currency = strings.ToUpper(params.Currency)

	return r.client.request("POST", "/payment-intents", params)
}

// Retrieve retrieves a payment intent by ID
func (r *PaymentIntentsResource) Retrieve(intentID string) (map[string]interface{}, error) {
	if intentID == "" {
		return nil, fmt.Errorf("intentID is required")
	}

	return r.client.request("GET", "/payment-intents/"+intentID, nil)
}

// UpdateParams contains parameters for updating a payment intent
type UpdateParams struct {
	Action             string `json:"action"`
	PaymentMethodToken string `json:"payment_method_token,omitempty"`
}

// Update updates a payment intent
func (r *PaymentIntentsResource) Update(intentID string, params *UpdateParams) (map[string]interface{}, error) {
	if intentID == "" {
		return nil, fmt.Errorf("intentID is required")
	}
	if params.Action == "" {
		return nil, fmt.Errorf("action is required (confirm, capture, cancel)")
	}

	return r.client.request("PATCH", "/payment-intents/"+intentID, params)
}

// Confirm confirms a payment intent
func (r *PaymentIntentsResource) Confirm(intentID, paymentMethodToken string) (map[string]interface{}, error) {
	return r.Update(intentID, &UpdateParams{
		Action:             "confirm",
		PaymentMethodToken: paymentMethodToken,
	})
}

// Capture captures a payment intent
func (r *PaymentIntentsResource) Capture(intentID string) (map[string]interface{}, error) {
	return r.Update(intentID, &UpdateParams{Action: "capture"})
}

// Cancel cancels a payment intent
func (r *PaymentIntentsResource) Cancel(intentID string) (map[string]interface{}, error) {
	return r.Update(intentID, &UpdateParams{Action: "cancel"})
}

// APIKeysResource handles API key operations
type APIKeysResource struct {
	client *Client
}

// APIKeyParams contains parameters for creating an API key
type APIKeyParams struct {
	MerchantID  string `json:"merchant_id"`
	KeyType     string `json:"key_type"`
	Environment string `json:"environment"`
}

// Create generates a new API key
func (r *APIKeysResource) Create(params *APIKeyParams) (map[string]interface{}, error) {
	if params.MerchantID == "" || params.KeyType == "" || params.Environment == "" {
		return nil, fmt.Errorf("merchant_id, key_type, and environment are required")
	}

	return r.client.request("POST", "/api-keys", params)
}

// List lists API keys for a merchant
func (r *APIKeysResource) List(merchantID string) (map[string]interface{}, error) {
	if merchantID == "" {
		return nil, fmt.Errorf("merchantID is required")
	}

	return r.client.request("GET", "/api-keys?merchant_id="+merchantID, nil)
}

// Revoke revokes an API key
func (r *APIKeysResource) Revoke(keyID string) (map[string]interface{}, error) {
	if keyID == "" {
		return nil, fmt.Errorf("keyID is required")
	}

	return r.client.request("DELETE", "/api-keys/"+keyID, nil)
}

// LogsResource handles logging operations
type LogsResource struct {
	client *Client
}

// LogParams contains parameters for creating a log entry
type LogParams struct {
	EventType       string                 `json:"event_type"`
	SDKVersion      string                 `json:"sdk_version,omitempty"`
	Platform        string                 `json:"platform,omitempty"`
	Payload         map[string]interface{} `json:"payload,omitempty"`
	IntentReference string                 `json:"intent_reference,omitempty"`
}

// Create creates a new log entry
func (r *LogsResource) Create(params *LogParams) (map[string]interface{}, error) {
	if params.EventType == "" {
		return nil, fmt.Errorf("event_type is required")
	}

	if params.SDKVersion == "" {
		params.SDKVersion = SDKVersion
	}
	if params.Platform == "" {
		params.Platform = "go"
	}

	return r.client.request("POST", "/logs", params)
}

// ListParams contains parameters for listing logs
type ListParams struct {
	MerchantID string
	Limit      int
	Offset     int
	EventType  string
}

// List lists logs for a merchant
func (r *LogsResource) List(params *ListParams) (map[string]interface{}, error) {
	if params.MerchantID == "" {
		return nil, fmt.Errorf("merchant_id is required")
	}

	if params.Limit == 0 {
		params.Limit = 100
	}

	query := url.Values{}
	query.Set("merchant_id", params.MerchantID)
	query.Set("limit", fmt.Sprintf("%d", params.Limit))
	query.Set("offset", fmt.Sprintf("%d", params.Offset))
	if params.EventType != "" {
		query.Set("event_type", params.EventType)
	}

	return r.client.request("GET", "/logs?"+query.Encode(), nil)
}
