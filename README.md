# n8n-nodes-tokensense

n8n community node for [TokenSense](https://tokensense.io) — one API key for every AI provider, with automatic cost tracking per workflow.

## What is TokenSense?

TokenSense is an AI gateway for automation teams. Connect OpenAI, Anthropic, Google Gemini, xAI, and Mistral through a single endpoint. Every request is logged with cost, tokens, and latency — broken down by workflow, step, and execution. Set budget caps, and TokenSense enforces them before you overspend.

Free tier available. Paid plans currently start from $29/month. TokenSense doesn't mark up provider rates.

## Nodes included

| Node | Type | Use case |
|------|------|----------|
| **TokenSense Chat Model** | AI Agent sub-node | Drop into any AI Agent as the language model — all providers through one credential |
| **TokenSense AI** | General purpose | Chat completions, embeddings, image generation, TTS, transcription, native Anthropic & Gemini |

## Installation

1. Go to **Settings → Community Nodes**
2. Click **Install a community node**
3. Enter `n8n-nodes-tokensense`
4. Click **Install**

## Setup

1. Create an account at [TokenSense Dashboard](https://app.tokensense.io)
2. Get your API key from **Dashboard → Keys**
3. In n8n, create a new credential — search for **TokenSense API**
4. Enter your TokenSense endpoint (`https://api.tokensense.io`) and API key
5. Click **Test** — you should see a green checkmark

## Usage: AI Agent with TokenSense Chat Model

1. Add an **AI Agent** node to your workflow
2. Click the **Chat Model** slot and select **TokenSense Chat Model**
3. Pick a model from the dropdown (loaded live from your TokenSense account)
4. Add tools and memory nodes as needed
5. Run the workflow

Every request is automatically logged in your TokenSense Dashboard with cost, latency, and token counts. Use the **Project** and **Workflow Tag** fields to organize requests by team or use case.

## Usage: General TokenSense AI Node

The **TokenSense AI** node is a standalone node for calling TokenSense directly from any workflow. Supported operations:

| Operation | Description |
|-----------|-------------|
| **Chat Completion** | Send messages to any chat model with optional JSON mode |
| **Generate Image** | Create images with GPT Image 2, GPT Image 1, Imagen 4, and more |
| **Create Embedding** | Generate vector embeddings for a text input |
| **Text to Speech** | Convert text to audio (MP3, WAV, FLAC, and more) |
| **Transcribe Audio** | Transcribe audio files using Whisper |
| **Native Anthropic** | Call the Anthropic Messages API directly |
| **Native Gemini** | Call the Google Gemini API directly |
| **List Models** | Fetch all models available in your TokenSense account |

## Usage: AI Agent Tool

The TokenSense AI node has `usableAsTool: true`, so n8n automatically makes it available as a **Tool** inside AI Agent workflows. Add it to the Tools slot to let your agent call TokenSense operations (chat, image generation, embeddings) as tools during execution.

## Compare providers without rewiring

Testing GPT-5.5 vs Claude Opus 4.8 vs Gemini 3.5 Flash? Change the model dropdown — the credential, endpoint, and workflow stay the same. Cost and latency for each model appear side-by-side in your TokenSense Dashboard.

## Features

- **One credential for all AI providers** — OpenAI, Anthropic, Google, xAI, Mistral
- **Automatic cost tracking** per request in the TokenSense Dashboard
- **Project and workflow tagging** for analytics and cost allocation
- **Dynamic model selection** loaded live from your TokenSense catalog
- **Provider override** — force a specific provider instead of automatic routing
- **Budget enforcement and rate limiting** enforced server-side by TokenSense
- **Works with all n8n AI Agent tools and memory nodes**

## Links

- [TokenSense](https://tokensense.io) — landing page and docs
- [TokenSense Dashboard](https://app.tokensense.io) — sign up and manage your account
- [n8n Setup Guide](https://tokensense.io/docs/integrations/n8n/setup) — step-by-step installation and configuration
- [GitHub](https://github.com/TheYote12/n8n-nodes-tokensense)
- [Report issues](https://github.com/TheYote12/n8n-nodes-tokensense/issues)

## License

MIT
