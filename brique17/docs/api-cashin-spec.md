# API Cash-In Specification

## Endpoints

### POST /api/agents/:agentId/cashin

**Authentication:**
- User JWT (Bearer token)
- Agent JWT (X-Agent-JWT header)

**Body:**
```json
{
    "amount": 10000,
    "currency": "XOF",
    "otp": "123456"
}