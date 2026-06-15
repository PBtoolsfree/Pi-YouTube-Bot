# AI Providers Setup

The bot uses a **failover engine** that tries providers in priority order.
If one fails, it automatically moves to the next.

---

## Supported Providers

| Provider | Type | Notes |
|----------|------|-------|
| Google Gemini | `gemini` | Best free tier, fast |
| OpenAI | `openai` | GPT-4o, most capable |
| OpenRouter | `custom` | Access 100+ models |
| Groq | `groq` | Ultra-fast inference |
| Ollama | `ollama` | Local, free, private |

---

## Google Gemini

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Create an API key
3. Add to config:

```json
{
  "id": "gemini",
  "type": "gemini",
  "enabled": true,
  "api_key": "AIza...",
  "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
  "models": [
    { "id": "gemini-2.0-flash", "enabled": true, "priority": 1 }
  ]
}
```

---

## OpenAI

1. Go to [platform.openai.com](https://platform.openai.com/api-keys)
2. Create an API key
3. Add to config:

```json
{
  "id": "openai",
  "type": "openai",
  "enabled": true,
  "api_key": "sk-...",
  "base_url": "https://api.openai.com/v1",
  "models": [
    { "id": "gpt-4o-mini", "enabled": true, "priority": 2 }
  ]
}
```

---

## OpenRouter (100+ Models)

1. Go to [openrouter.ai](https://openrouter.ai/keys)
2. Create an API key (free tier available)
3. Add to config:

```json
{
  "id": "openrouter",
  "type": "custom",
  "enabled": true,
  "api_key": "sk-or-...",
  "base_url": "https://openrouter.ai/api/v1",
  "models": [
    { "id": "meta-llama/llama-3.1-8b-instruct:free", "enabled": true, "priority": 3 }
  ]
}
```

---

## Groq (Ultra-Fast)

1. Go to [console.groq.com](https://console.groq.com/keys)
2. Create API key (generous free tier)
3. Add to config:

```json
{
  "id": "groq",
  "type": "groq",
  "enabled": true,
  "api_key": "gsk_...",
  "base_url": "https://api.groq.com/openai/v1",
  "models": [
    { "id": "llama-3.1-8b-instant", "enabled": true, "priority": 1 }
  ]
}
```

---

## Ollama (Local / Offline)

1. Install Ollama on any machine: `curl -fsSL https://ollama.com/install.sh | sh`
2. Pull a model: `ollama pull llama3.2`
3. Make sure Ollama is accessible from the Pi (check `OLLAMA_HOST`)

```json
{
  "id": "ollama",
  "type": "ollama",
  "enabled": true,
  "base_url": "http://192.168.1.100:11434",
  "models": [
    { "id": "llama3.2", "enabled": true, "priority": 1 }
  ]
}
```

---

## Failover Order

Models are tried in ascending `priority` order across all enabled providers.
Set `priority: 999` on models you want only as a last resort.

Test a provider via the dashboard or:
```bash
curl -X POST http://localhost:8000/api/providers/test/gemini
```
