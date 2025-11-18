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

// WebhooksResource handles webhook operations
type WebhooksResource struct {
	http *HttpClient
}

// VerifySignature verifies a webhook signature
func (w *WebhooksResource) VerifySignature(rawBody string, sigHeader string, secret string) error {
	parts := make(map[string]string)
	for _, p := range strings.Split(sigHeader, ",") {
		kv := strings.SplitN(p, "=", 2)
		if len(kv) == 2 {
			parts[kv[0]] = kv[1]
		}
	}

	tstr, ok := parts["t"]
	v1, ok2 := parts["v1"]

	if !ok || !ok2 {
		return errors.New("invalid signature header format")
	}

	// Check timestamp (5-minute tolerance)
	t, err := strconv.ParseInt(tstr, 10, 64)
	if err != nil {
		return errors.New("invalid timestamp")
	}

	now := time.Now().UnixNano() / 1e6
	if math.Abs(float64(now-t)) > 5*60*1000 {
		return errors.New("signature timestamp outside tolerance")
	}

	// Compute HMAC
	payload := tstr + "." + rawBody
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(payload))
	computed := hex.EncodeToString(mac.Sum(nil))

	// Constant-time comparison
	if !hmac.Equal([]byte(computed), []byte(v1)) {
		return errors.New("signature mismatch")
	}

	return nil
}

// CreateEndpoint creates a webhook endpoint
func (w *WebhooksResource) CreateEndpoint(tenantType, tenantID, url string, events []string) (map[string]interface{}, error) {
	payload := map[string]interface{}{
		"tenant_type": tenantType,
		"tenant_id":   tenantID,
		"url":         url,
		"events":      events,
	}
	return w.http.Post("/v1/webhooks/endpoints", payload)
}

// ListEndpoints lists webhook endpoints
func (w *WebhooksResource) ListEndpoints(tenantType, tenantID string) (map[string]interface{}, error) {
	path := "/v1/webhooks/endpoints?tenant_type=" + tenantType + "&tenant_id=" + tenantID
	return w.http.Get(path)
}

// DeleteEndpoint deletes a webhook endpoint
func (w *WebhooksResource) DeleteEndpoint(endpointID string) (map[string]interface{}, error) {
	return w.http.Delete("/v1/webhooks/endpoints/" + endpointID)
}
