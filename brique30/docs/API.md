# API Voice/TTS

## Envoyer un message vocal

**POST /api/voice/send**

Body:
```json
{
  "user_id": "uuid",
  "template_key": "string",
  "vars": { "key": "value" },
  "prefer_voice": false
}