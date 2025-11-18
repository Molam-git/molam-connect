package client

// RefundsResource handles refund operations
type RefundsResource struct {
	http *HttpClient
}

// Refund represents a refund
type Refund struct {
	ID        string `json:"id"`
	PaymentID string `json:"payment_id"`
	Amount    int64  `json:"amount"`
	Status    string `json:"status"`
	CreatedAt string `json:"created_at"`
}

// Create creates a new refund
func (r *RefundsResource) Create(payload map[string]interface{}) (map[string]interface{}, error) {
	body := map[string]interface{}{
		"refund": payload,
	}
	resp, err := r.http.Post("/v1/refunds", body)
	if err != nil {
		return nil, err
	}

	if data, ok := resp["data"].(map[string]interface{}); ok {
		return data, nil
	}

	return resp, nil
}

// Retrieve retrieves a refund by ID
func (r *RefundsResource) Retrieve(id string) (map[string]interface{}, error) {
	resp, err := r.http.Get("/v1/refunds/" + id)
	if err != nil {
		return nil, err
	}

	if data, ok := resp["data"].(map[string]interface{}); ok {
		return data, nil
	}

	return resp, nil
}

// List lists refunds
func (r *RefundsResource) List() ([]interface{}, error) {
	resp, err := r.http.Get("/v1/refunds")
	if err != nil {
		return nil, err
	}

	if data, ok := resp["data"].([]interface{}); ok {
		return data, nil
	}

	return []interface{}{}, nil
}
