package client

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/google/uuid"
)

// HttpClient handles HTTP requests with retries
type HttpClient struct {
	baseURL    string
	apiKey     string
	timeout    time.Duration
	maxRetries int
	client     *http.Client
}

// NewHttpClient creates a new HTTP client
func NewHttpClient(opts ClientOptions) *HttpClient {
	return &HttpClient{
		baseURL:    opts.BaseURL,
		apiKey:     opts.APIKey,
		timeout:    time.Duration(opts.TimeoutMS) * time.Millisecond,
		maxRetries: opts.MaxRetries,
		client:     &http.Client{Timeout: time.Duration(opts.TimeoutMS) * time.Millisecond},
	}
}

// Get makes a GET request
func (c *HttpClient) Get(path string) (map[string]interface{}, error) {
	return c.requestWithRetry("GET", path, nil)
}

// Post makes a POST request
func (c *HttpClient) Post(path string, body map[string]interface{}) (map[string]interface{}, error) {
	return c.requestWithRetry("POST", path, body)
}

// Put makes a PUT request
func (c *HttpClient) Put(path string, body map[string]interface{}) (map[string]interface{}, error) {
	return c.requestWithRetry("PUT", path, body)
}

// Delete makes a DELETE request
func (c *HttpClient) Delete(path string) (map[string]interface{}, error) {
	return c.requestWithRetry("DELETE", path, nil)
}

func (c *HttpClient) requestWithRetry(method, path string, body map[string]interface{}) (map[string]interface{}, error) {
	idempotencyKey := uuid.New().String()
	url := c.baseURL + path
	attempt := 0

	for {
		var reqBody io.Reader
		if body != nil {
			jsonData, err := json.Marshal(body)
			if err != nil {
				return nil, fmt.Errorf("failed to marshal request body: %w", err)
			}
			reqBody = bytes.NewBuffer(jsonData)
		}

		req, err := http.NewRequest(method, url, reqBody)
		if err != nil {
			return nil, fmt.Errorf("failed to create request: %w", err)
		}

		req.Header.Set("Authorization", "Bearer "+c.apiKey)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("User-Agent", "Molam-SDK-Go/2.0")
		req.Header.Set("Idempotency-Key", idempotencyKey)

		resp, err := c.client.Do(req)
		if err != nil {
			if attempt >= c.maxRetries {
				return nil, fmt.Errorf("request failed after %d retries: %w", c.maxRetries, err)
			}
			time.Sleep(backoff(attempt))
			attempt++
			continue
		}

		defer resp.Body.Close()

		respBody, err := io.ReadAll(resp.Body)
		if err != nil {
			return nil, fmt.Errorf("failed to read response body: %w", err)
		}

		if resp.StatusCode >= 400 {
			if attempt < c.maxRetries && isRetryableStatus(resp.StatusCode) {
				time.Sleep(backoff(attempt))
				attempt++
				continue
			}

			var errResp map[string]interface{}
			json.Unmarshal(respBody, &errResp)
			return nil, fmt.Errorf("API error: %d - %v", resp.StatusCode, errResp)
		}

		var result map[string]interface{}
		if len(respBody) > 0 {
			if err := json.Unmarshal(respBody, &result); err != nil {
				return nil, fmt.Errorf("failed to unmarshal response: %w", err)
			}
		}

		return result, nil
	}
}

func isRetryableStatus(status int) bool {
	if status >= 500 {
		return true
	}
	return status == 408 || status == 429 || status == 425
}

func backoff(attempt int) time.Duration {
	sequence := []int{200, 500, 1000, 2000, 5000}
	idx := attempt
	if idx >= len(sequence) {
		idx = len(sequence) - 1
	}
	return time.Duration(sequence[idx]) * time.Millisecond
}
