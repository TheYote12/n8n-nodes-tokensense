# n8n-nodes-tokensense

Community node for [TokenSense](https://app.tokensense.io) — a unified AI gateway with cost tracking, multi-provider routing, and project management.

## What is TokenSense?

TokenSense is a universal AI gateway that sits between your automation tools and AI providers (OpenAI, Anthropic, Google, xAI, Mistral). It gives you a single API key, automatic cost tracking, budget enforcement, and intelligent routing — all without changing your workflow logic.

## Nodes included

| Node | Type | Use case |
|------|------|----------|
| **TokenSense Chat Model** | AI Agent sub-node | Attach to any n8n AI Agent as the language model |
| **TokenSense Embeddings** | RAG sub-node | Generate text embeddings for vector store workflows |
| **TokenSense AI** | General purpose | Chat completions, image generation, TTS, transcription, and more |

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

## Usage: RAG Pipeline with TokenSense Embeddings

Add the **TokenSense Embeddings** sub-node to any vector store node (Pinecone, Qdrant, Supabase, etc.) that accepts an Embeddings input. Select your embedding model and optionally set output dimensions for `text-embedding-3-*` models.

## Usage: General TokenSense AI Node

The **TokenSense AI** node is a standalone node for calling TokenSense directly from any workflow. Supported operations:

| Operation | Description |
|-----------|-------------|
| **Chat Completion** | Send messages to any chat model with optional JSON mode |
| **Generate Image** | Create images with DALL-E 3, DALL-E 2, or GPT Image 1 |
| **Create Embedding** | Generate vector embeddings for a text input |
| **Text to Speech** | Convert text to audio (MP3, WAV, FLAC, and more) |
| **Transcribe Audio** | Transcribe audio files using Whisper |
| **Native Anthropic** | Call the Anthropic Messages API directly |
| **Native Gemini** | Call the Google Gemini API directly |
| **List Models** | Fetch all models available in your TokenSense account |

## Features

- **One credential for all AI providers** — OpenAI, Anthropic, Google, xAI, Mistral
- **Automatic cost tracking** per request in the TokenSense Dashboard
- **Project and workflow tagging** for analytics and cost allocation
- **Dynamic model selection** loaded live from your TokenSense catalog
- **Provider override** — force a specific provider instead of automatic routing
- **Budget enforcement and rate limiting** enforced server-side by TokenSense
- **Works with all n8n AI Agent tools and memory nodes**

## Links

- [TokenSense Dashboard](https://app.tokensense.io)
- [GitHub](https://github.com/TheYote12/n8n-nodes-tokensense)
- [Report issues](https://github.com/TheYote12/n8n-nodes-tokensense/issues)

## Publishing (maintainer note)

The publish workflow triggers automatically when you push a tag matching `v*`. Before publishing, add an `NPM_TOKEN` secret in the GitHub repository **Settings → Secrets → Actions**.

```bash
git tag v0.1.0
git push origin v0.1.0
```

## License

MIT
