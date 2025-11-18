package client

// PaymentsResource handles payment intent operations
type PaymentsResource struct {
	http *HttpClient
}

// PaymentIntent represents a payment intent
type PaymentIntent struct {
	ID         string                 `json:"id"`
	Amount     int64                  `json:"amount"`
	Currency   string                 `json:"currency"`
	Status     string                 `json:"status"`
	MerchantID string                 `json:"merchant_id"`
	CreatedAt  string                 `json:"created_at"`
	Metadata   map[string]interface{} `json:"metadata,omitempty"`
}

// CreatePaymentIntent creates a new payment intent
func (p *PaymentsResource) Create(payload map[string]interface{}) (map[string]interface{}, error) {
	body := map[string]interface{}{
		"payment_intent": payload,
	}
	resp, err := p.http.Post("/v1/payment_intents", body)
	if err != nil {
		return nil, err
	}

	if data, ok := resp["data"].(map[string]interface{}); ok {
		return data, nil
	}

	return resp, nil
}

// Retrieve retrieves a payment intent by ID
func (p *PaymentsResource) Retrieve(id string) (map[string]interface{}, error) {
	resp, err := p.http.Get("/v1/payment_intents/" + id)
	if err != nil {
		return nil, err
	}

	if data, ok := resp["data"].(map[string]interface{}); ok {
		return data, nil
	}

	return resp, nil
}

// Confirm confirms a payment intent
func (p *PaymentsResource) Confirm(id string) (map[string]interface{}, error) {
	resp, err := p.http.Post("/v1/payment_intents/"+id+"/confirm", nil)
	if err != nil {
		return nil, err
	}

	if data, ok := resp["data"].(map[string]interface{}); ok {
		return data, nil
	}

	return resp, nil
}

// Cancel cancels a payment intent
func (p *PaymentsResource) Cancel(id string) (map[string]interface{}, error) {
	resp, err := p.http.Post("/v1/payment_intents/"+id+"/cancel", nil)
	if err != nil {
		return nil, err
	}

	if data, ok := resp["data"].(map[string]interface{}); ok {
		return data, nil
	}

	return resp, nil
}

// List lists payment intents
func (p *PaymentsResource) List() ([]interface{}, error) {
	resp, err := p.http.Get("/v1/payment_intents")
	if err != nil {
		return nil, err
	}

	if data, ok := resp["data"].([]interface{}); ok {
		return data, nil
	}

	return []interface{}{}, nil
}
