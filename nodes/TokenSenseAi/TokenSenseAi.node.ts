import type {
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import FormData from 'form-data';
import { buildMetadata, loadModels } from '../../shared/utils';

export class TokenSenseAi implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'TokenSense AI',
		name: 'tokenSenseAi',
		icon: 'file:../../icons/tokensense.svg',
		group: ['transform'],
		version: 1,
		description: 'Call TokenSense for chat completions, embeddings, image generation, and more',
		defaults: { name: 'TokenSense AI' },
		codex: {
			categories: ['AI'],
			subcategories: { AI: ['Language Models'] },
			resources: {
				primaryDocumentation: [{ url: 'https://github.com/TheYote12/n8n-nodes-tokensense' }],
			},
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'tokenSenseApi', required: true }],
		properties: [
			// ── Operation selector ──
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				default: 'chatCompletion',
				options: [
					{ name: 'Chat Completion', value: 'chatCompletion' },
					{ name: 'Generate Image', value: 'generateImage' },
					{ name: 'Create Embedding', value: 'createEmbedding' },
					{ name: 'Text to Speech', value: 'textToSpeech' },
					{ name: 'Transcribe Audio', value: 'transcribeAudio' },
					{ name: 'Native Anthropic', value: 'nativeAnthropic' },
					{ name: 'Native Gemini', value: 'nativeGemini' },
					{ name: 'List Models', value: 'listModels' },
				],
			},

			// ── Chat Completion parameters ──
			{
				displayName: 'Model',
				name: 'model',
				type: 'options',
				default: 'gpt-4o',
				required: true,
				typeOptions: { loadOptionsMethod: 'getModels' },
				displayOptions: { show: { operation: ['chatCompletion'] } },
			},
			{
				displayName: 'System Prompt',
				name: 'systemPrompt',
				type: 'string',
				default: '',
				typeOptions: { rows: 4 },
				description: 'Optional system message to set the behavior of the model',
				displayOptions: { show: { operation: ['chatCompletion'] } },
			},
			{
				displayName: 'User Message',
				name: 'userMessage',
				type: 'string',
				default: '',
				required: true,
				typeOptions: { rows: 4 },
				description: 'The message to send to the model',
				displayOptions: { show: { operation: ['chatCompletion'] } },
			},
			{
				displayName: 'Temperature',
				name: 'temperature',
				type: 'number',
				default: 0.7,
				typeOptions: { minValue: 0, maxValue: 2, numberPrecision: 1 },
				description: 'Controls randomness in the output',
				displayOptions: { show: { operation: ['chatCompletion'] } },
			},
			{
				displayName: 'Max Tokens',
				name: 'maxTokens',
				type: 'number',
				default: 0,
				description: 'Maximum number of tokens to generate. Leave at 0 for model default.',
				displayOptions: { show: { operation: ['chatCompletion'] } },
			},
			{
				displayName: 'JSON Mode',
				name: 'jsonMode',
				type: 'boolean',
				default: false,
				description: 'Whether to force the model to respond with valid JSON',
				displayOptions: { show: { operation: ['chatCompletion'] } },
			},
			{
				displayName: 'Project',
				name: 'project',
				type: 'string',
				default: '',
				description: 'TokenSense project name for cost tracking and analytics',
				displayOptions: {
					show: {
						operation: [
							'chatCompletion',
							'generateImage',
							'createEmbedding',
							'textToSpeech',
							'transcribeAudio',
							'nativeAnthropic',
							'nativeGemini',
						],
					},
				},
			},
			{
				displayName: 'Workflow Tag',
				name: 'workflowTag',
				type: 'string',
				default: '',
				description: 'Tag to identify this workflow in TokenSense Dashboard. Auto-detected from workflow name if left empty.',
				displayOptions: {
					show: {
						operation: [
							'chatCompletion',
							'generateImage',
							'createEmbedding',
							'textToSpeech',
							'transcribeAudio',
							'nativeAnthropic',
							'nativeGemini',
						],
					},
				},
			},
			{
				displayName: 'Provider Override',
				name: 'providerOverride',
				type: 'options',
				default: 'auto',
				description: 'Force a specific provider instead of automatic routing',
				options: [
					{ name: 'Auto', value: 'auto' },
					{ name: 'OpenAI', value: 'openai' },
					{ name: 'Anthropic', value: 'anthropic' },
					{ name: 'Google', value: 'google' },
					{ name: 'xAI', value: 'xai' },
					{ name: 'Mistral', value: 'mistral' },
				],
				displayOptions: { show: { operation: ['chatCompletion', 'generateImage'] } },
			},

			// ── Generate Image parameters ──
			{
				displayName: 'Prompt',
				name: 'imagePrompt',
				type: 'string',
				default: '',
				required: true,
				typeOptions: { rows: 4 },
				description: 'Text description of the image to generate',
				displayOptions: { show: { operation: ['generateImage'] } },
			},
			{
				displayName: 'Model',
				name: 'imageModel',
				type: 'options',
				default: 'dall-e-3',
				options: [
					{ name: 'DALL-E 3', value: 'dall-e-3' },
					{ name: 'DALL-E 2', value: 'dall-e-2' },
					{ name: 'GPT Image 1', value: 'gpt-image-1' },
				],
				displayOptions: { show: { operation: ['generateImage'] } },
			},
			{
				displayName: 'Size',
				name: 'imageSize',
				type: 'options',
				default: '1024x1024',
				options: [
					{ name: '1024x1024', value: '1024x1024' },
					{ name: '1792x1024', value: '1792x1024' },
					{ name: '1024x1792', value: '1024x1792' },
				],
				displayOptions: { show: { operation: ['generateImage'] } },
			},
			{
				displayName: 'Quality',
				name: 'imageQuality',
				type: 'options',
				default: 'standard',
				options: [
					{ name: 'Standard', value: 'standard' },
					{ name: 'HD', value: 'hd' },
				],
				displayOptions: { show: { operation: ['generateImage'] } },
			},
			{
				displayName: 'Number of Images',
				name: 'imageCount',
				type: 'number',
				default: 1,
				typeOptions: { minValue: 1, maxValue: 10 },
				displayOptions: { show: { operation: ['generateImage'] } },
			},

			// ── Create Embedding parameters ──
			{
				displayName: 'Input Text',
				name: 'embeddingInput',
				type: 'string',
				default: '',
				required: true,
				description: 'Text to embed',
				displayOptions: { show: { operation: ['createEmbedding'] } },
			},
			{
				displayName: 'Model',
				name: 'embeddingModel',
				type: 'options',
				default: 'text-embedding-3-small',
				options: [
					{ name: 'Text Embedding 3 Small', value: 'text-embedding-3-small' },
					{ name: 'Text Embedding 3 Large', value: 'text-embedding-3-large' },
					{ name: 'Text Embedding Ada 002', value: 'text-embedding-ada-002' },
				],
				displayOptions: { show: { operation: ['createEmbedding'] } },
			},
			{
				displayName: 'Dimensions',
				name: 'embeddingDimensions',
				type: 'number',
				default: 0,
				description: 'Output dimensions (only for text-embedding-3-* models). Leave at 0 for model default.',
				displayOptions: { show: { operation: ['createEmbedding'] } },
			},

			// ── Text to Speech parameters ──
			{
				displayName: 'Input Text',
				name: 'ttsInput',
				type: 'string',
				default: '',
				required: true,
				typeOptions: { rows: 4 },
				description: 'Text to convert to speech',
				displayOptions: { show: { operation: ['textToSpeech'] } },
			},
			{
				displayName: 'Model',
				name: 'ttsModel',
				type: 'options',
				default: 'tts-1',
				options: [
					{ name: 'TTS-1', value: 'tts-1' },
					{ name: 'TTS-1 HD', value: 'tts-1-hd' },
				],
				displayOptions: { show: { operation: ['textToSpeech'] } },
			},
			{
				displayName: 'Voice',
				name: 'ttsVoice',
				type: 'options',
				default: 'alloy',
				options: [
					{ name: 'Alloy', value: 'alloy' },
					{ name: 'Echo', value: 'echo' },
					{ name: 'Fable', value: 'fable' },
					{ name: 'Onyx', value: 'onyx' },
					{ name: 'Nova', value: 'nova' },
					{ name: 'Shimmer', value: 'shimmer' },
				],
				displayOptions: { show: { operation: ['textToSpeech'] } },
			},
			{
				displayName: 'Response Format',
				name: 'ttsFormat',
				type: 'options',
				default: 'mp3',
				options: [
					{ name: 'MP3', value: 'mp3' },
					{ name: 'Opus', value: 'opus' },
					{ name: 'AAC', value: 'aac' },
					{ name: 'FLAC', value: 'flac' },
					{ name: 'WAV', value: 'wav' },
					{ name: 'PCM', value: 'pcm' },
				],
				displayOptions: { show: { operation: ['textToSpeech'] } },
			},
			{
				displayName: 'Speed',
				name: 'ttsSpeed',
				type: 'number',
				default: 1.0,
				typeOptions: { minValue: 0.25, maxValue: 4.0, numberPrecision: 2 },
				description: 'Speed of the generated audio (0.25 to 4.0)',
				displayOptions: { show: { operation: ['textToSpeech'] } },
			},

			// ── Transcribe Audio parameters ──
			{
				displayName: 'Binary Property',
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data',
				description: 'Name of the binary property containing the audio file',
				displayOptions: { show: { operation: ['transcribeAudio'] } },
			},
			{
				displayName: 'Model',
				name: 'sttModel',
				type: 'options',
				default: 'whisper-1',
				options: [
					{ name: 'Whisper 1', value: 'whisper-1' },
					{ name: 'Whisper 1 HD', value: 'whisper-1-hd' },
				],
				displayOptions: { show: { operation: ['transcribeAudio'] } },
			},
			{
				displayName: 'Language',
				name: 'sttLanguage',
				type: 'string',
				default: '',
				description: 'ISO 639-1 language code (e.g. "en", "es", "fr"). Leave empty for auto-detection.',
				displayOptions: { show: { operation: ['transcribeAudio'] } },
			},
			{
				displayName: 'Response Format',
				name: 'sttFormat',
				type: 'options',
				default: 'json',
				options: [
					{ name: 'JSON', value: 'json' },
					{ name: 'Text', value: 'text' },
					{ name: 'SRT', value: 'srt' },
					{ name: 'Verbose JSON', value: 'verbose_json' },
					{ name: 'VTT', value: 'vtt' },
				],
				displayOptions: { show: { operation: ['transcribeAudio'] } },
			},

			// ── Native Anthropic parameters ──
			{
				displayName: 'Model',
				name: 'anthropicModel',
				type: 'options',
				default: 'claude-sonnet-4-5-20250929',
				options: [
					{ name: 'Claude Sonnet 4.5', value: 'claude-sonnet-4-5-20250929' },
					{ name: 'Claude Haiku 3.5', value: 'claude-haiku-3-5-20241022' },
					{ name: 'Claude Opus 4', value: 'claude-opus-4-20250514' },
				],
				displayOptions: { show: { operation: ['nativeAnthropic'] } },
			},
			{
				displayName: 'System Prompt',
				name: 'anthropicSystemPrompt',
				type: 'string',
				default: '',
				typeOptions: { rows: 4 },
				description: 'Optional system prompt',
				displayOptions: { show: { operation: ['nativeAnthropic'] } },
			},
			{
				displayName: 'User Message',
				name: 'anthropicUserMessage',
				type: 'string',
				default: '',
				required: true,
				typeOptions: { rows: 4 },
				description: 'The message to send',
				displayOptions: { show: { operation: ['nativeAnthropic'] } },
			},
			{
				displayName: 'Max Tokens',
				name: 'anthropicMaxTokens',
				type: 'number',
				default: 1024,
				required: true,
				description: 'Maximum number of tokens to generate (required by Anthropic)',
				displayOptions: { show: { operation: ['nativeAnthropic'] } },
			},
			{
				displayName: 'Temperature',
				name: 'anthropicTemperature',
				type: 'number',
				default: 1.0,
				typeOptions: { minValue: 0, maxValue: 1, numberPrecision: 1 },
				description: 'Controls randomness (0-1)',
				displayOptions: { show: { operation: ['nativeAnthropic'] } },
			},

			// ── Native Gemini parameters ──
			{
				displayName: 'Model',
				name: 'geminiModel',
				type: 'options',
				default: 'gemini-2.0-flash',
				options: [
					{ name: 'Gemini 2.0 Flash', value: 'gemini-2.0-flash' },
					{ name: 'Gemini 2.0 Flash Lite', value: 'gemini-2.0-flash-lite' },
					{ name: 'Gemini 1.5 Pro', value: 'gemini-1.5-pro' },
				],
				displayOptions: { show: { operation: ['nativeGemini'] } },
			},
			{
				displayName: 'User Message',
				name: 'geminiUserMessage',
				type: 'string',
				default: '',
				required: true,
				typeOptions: { rows: 4 },
				description: 'The message to send',
				displayOptions: { show: { operation: ['nativeGemini'] } },
			},
			{
				displayName: 'System Instruction',
				name: 'geminiSystemInstruction',
				type: 'string',
				default: '',
				typeOptions: { rows: 4 },
				description: 'Optional system instruction',
				displayOptions: { show: { operation: ['nativeGemini'] } },
			},
			{
				displayName: 'Temperature',
				name: 'geminiTemperature',
				type: 'number',
				default: 1.0,
				typeOptions: { minValue: 0, maxValue: 2, numberPrecision: 1 },
				description: 'Controls randomness (0-2)',
				displayOptions: { show: { operation: ['nativeGemini'] } },
			},
			{
				displayName: 'Max Output Tokens',
				name: 'geminiMaxOutputTokens',
				type: 'number',
				default: 0,
				description: 'Maximum output tokens. Leave at 0 for model default.',
				displayOptions: { show: { operation: ['nativeGemini'] } },
			},
		],
	};

	methods = {
		loadOptions: {
			async getModels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return loadModels.call(this);
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const credentials = await this.getCredentials('tokenSenseApi');
		const endpoint = credentials.endpoint as string;
		const apiKey = credentials.apiKey as string;

		for (let i = 0; i < items.length; i++) {
			try {
			const operation = this.getNodeParameter('operation', i) as string;

			if (operation === 'chatCompletion') {
				const model = this.getNodeParameter('model', i) as string;
				const systemPrompt = this.getNodeParameter('systemPrompt', i, '') as string;
				const userMessage = this.getNodeParameter('userMessage', i) as string;
				const temperature = this.getNodeParameter('temperature', i) as number;
				const maxTokens = this.getNodeParameter('maxTokens', i) as number;
				const jsonMode = this.getNodeParameter('jsonMode', i) as boolean;

				const messages: Array<{ role: string; content: string }> = [];
				if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
				messages.push({ role: 'user', content: userMessage });

				const metadata = buildMetadata(this, i, { includeProvider: true });

				const body: Record<string, unknown> = { model, messages, temperature, metadata };
				if (maxTokens > 0) body.max_tokens = maxTokens;
				if (jsonMode) body.response_format = { type: 'json_object' };

				const response = await this.helpers.httpRequest({
					method: 'POST',
					url: `${endpoint}/v1/chat/completions`,
					headers: { 'Content-Type': 'application/json', 'x-tokensense-key': apiKey },
					body,
					returnFullResponse: true,
				});

				const responseBody = response.body as {
					choices?: Array<{ message?: { content?: string; role?: string } }>;
					model?: string;
					usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
					tokensense?: { request_id?: string; cost_usd?: number; model?: string; provider?: string; latency_ms?: number; tokens?: { prompt?: number; completion?: number; total?: number } };
				};

				returnData.push({
					json: {
						content: responseBody.choices?.[0]?.message?.content ?? '',
						role: responseBody.choices?.[0]?.message?.role ?? 'assistant',
						model: responseBody.model ?? model,
						usage: responseBody.usage ?? {},
						requestId: responseBody.tokensense?.request_id ?? '',
						cost: String(responseBody.tokensense?.cost_usd ?? ''),
						effectiveModel: responseBody.tokensense?.model ?? '',
						provider: responseBody.tokensense?.provider ?? '',
						latencyMs: responseBody.tokensense?.latency_ms ?? null,
						tokens: responseBody.tokensense?.tokens ?? {},
					},
				});
			} else if (operation === 'generateImage') {
				const prompt = this.getNodeParameter('imagePrompt', i) as string;
				const model = this.getNodeParameter('imageModel', i) as string;
				const size = this.getNodeParameter('imageSize', i) as string;
				const quality = this.getNodeParameter('imageQuality', i) as string;
				const n = this.getNodeParameter('imageCount', i) as number;

				const metadata = buildMetadata(this, i, { includeProvider: true });

				const body: Record<string, unknown> = { prompt, model, size, quality, n, metadata };

				const response = await this.helpers.httpRequest({
					method: 'POST',
					url: `${endpoint}/v1/images/generations`,
					headers: { 'Content-Type': 'application/json', 'x-tokensense-key': apiKey },
					body,
					returnFullResponse: true,
				});

				const responseBody = response.body as {
					data?: Array<{ url?: string; revised_prompt?: string }>;
					tokensense?: { request_id?: string; cost_usd?: number; model?: string; provider?: string; latency_ms?: number; tokens?: { prompt?: number; completion?: number; total?: number } };
				};

				const urls = (responseBody.data ?? []).map((img) => img.url ?? '');
				returnData.push({
					json: {
						urls,
						data: responseBody.data ?? [],
						requestId: responseBody.tokensense?.request_id ?? '',
						cost: String(responseBody.tokensense?.cost_usd ?? ''),
						provider: responseBody.tokensense?.provider ?? '',
						latencyMs: responseBody.tokensense?.latency_ms ?? null,
					},
				});
			} else if (operation === 'createEmbedding') {
				const input = this.getNodeParameter('embeddingInput', i) as string;
				const model = this.getNodeParameter('embeddingModel', i) as string;
				const dimensions = this.getNodeParameter('embeddingDimensions', i) as number;

				const metadata = buildMetadata(this, i);

				const body: Record<string, unknown> = { input, model, metadata };
				if (dimensions > 0) body.dimensions = dimensions;

				const response = await this.helpers.httpRequest({
					method: 'POST',
					url: `${endpoint}/v1/embeddings`,
					headers: { 'Content-Type': 'application/json', 'x-tokensense-key': apiKey },
					body,
					returnFullResponse: true,
				});

				const responseBody = response.body as {
					data?: Array<{ embedding?: number[] }>;
					model?: string;
					usage?: { prompt_tokens?: number; total_tokens?: number };
					tokensense?: { request_id?: string; cost_usd?: number; model?: string; provider?: string; latency_ms?: number; tokens?: { prompt?: number; completion?: number; total?: number } };
				};

				returnData.push({
					json: {
						embedding: responseBody.data?.[0]?.embedding ?? [],
						model: responseBody.model ?? model,
						usage: responseBody.usage ?? {},
						requestId: responseBody.tokensense?.request_id ?? '',
						cost: String(responseBody.tokensense?.cost_usd ?? ''),
						provider: responseBody.tokensense?.provider ?? '',
						latencyMs: responseBody.tokensense?.latency_ms ?? null,
						tokens: responseBody.tokensense?.tokens ?? {},
					},
				});
			} else if (operation === 'textToSpeech') {
				const input = this.getNodeParameter('ttsInput', i) as string;
				const model = this.getNodeParameter('ttsModel', i) as string;
				const voice = this.getNodeParameter('ttsVoice', i) as string;
				const responseFormat = this.getNodeParameter('ttsFormat', i) as string;
				const speed = this.getNodeParameter('ttsSpeed', i) as number;

				const metadata = buildMetadata(this, i);

				const body: Record<string, unknown> = {
					input,
					model,
					voice,
					response_format: responseFormat,
					speed,
					metadata,
				};

				const mimeTypes: Record<string, string> = {
					mp3: 'audio/mpeg',
					opus: 'audio/opus',
					aac: 'audio/aac',
					flac: 'audio/flac',
					wav: 'audio/wav',
					pcm: 'audio/pcm',
				};

				const response = await this.helpers.httpRequest({
					method: 'POST',
					url: `${endpoint}/v1/audio/speech`,
					headers: { 'Content-Type': 'application/json', 'x-tokensense-key': apiKey },
					body,
					encoding: 'arraybuffer',
					returnFullResponse: true,
				});

				const buffer = Buffer.from(response.body as ArrayBuffer);
				const mimeType = mimeTypes[responseFormat] ?? 'audio/mpeg';
				const fileName = `speech.${responseFormat}`;
				const binaryData = await this.helpers.prepareBinaryData(buffer, fileName, mimeType);

				returnData.push({
					json: { success: true },
					binary: { data: binaryData },
				});
			} else if (operation === 'transcribeAudio') {
				const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;
				const model = this.getNodeParameter('sttModel', i) as string;
				const language = this.getNodeParameter('sttLanguage', i, '') as string;
				const responseFormat = this.getNodeParameter('sttFormat', i) as string;
				const binaryBuffer = await this.helpers.getBinaryDataBuffer(i, binaryPropertyName);
				const binaryMeta = items[i].binary?.[binaryPropertyName];
				const fileName = binaryMeta?.fileName ?? 'audio.wav';
				const mimeType = binaryMeta?.mimeType ?? 'audio/wav';

				const metadata = buildMetadata(this, i);

				const formBody = new FormData();
				formBody.append('file', Buffer.from(binaryBuffer), { filename: fileName, contentType: mimeType });
				formBody.append('model', model);
				formBody.append('response_format', responseFormat);
				if (language) formBody.append('language', language);
				formBody.append('metadata', JSON.stringify(metadata));

				const response = await this.helpers.httpRequest({
					method: 'POST',
					url: `${endpoint}/v1/audio/transcriptions`,
					headers: { 'x-tokensense-key': apiKey, ...formBody.getHeaders() },
					body: formBody,
					returnFullResponse: true,
				});

				const responseBody = response.body as { text?: string; tokensense?: { request_id?: string; cost_usd?: number; model?: string; provider?: string; latency_ms?: number } } | string;

				const text = typeof responseBody === 'string' ? responseBody : (responseBody.text ?? '');
				const meta = typeof responseBody === 'string' ? undefined : responseBody.tokensense;
				returnData.push({
					json: {
						text,
						requestId: meta?.request_id ?? '',
						cost: String(meta?.cost_usd ?? ''),
						provider: meta?.provider ?? '',
						latencyMs: meta?.latency_ms ?? null,
					},
				});
			} else if (operation === 'nativeAnthropic') {
				const model = this.getNodeParameter('anthropicModel', i) as string;
				const systemPrompt = this.getNodeParameter('anthropicSystemPrompt', i, '') as string;
				const userMessage = this.getNodeParameter('anthropicUserMessage', i) as string;
				const maxTokens = this.getNodeParameter('anthropicMaxTokens', i) as number;
				const temperature = this.getNodeParameter('anthropicTemperature', i) as number;

				const metadata = buildMetadata(this, i);

				const body: Record<string, unknown> = {
					model,
					max_tokens: maxTokens,
					messages: [{ role: 'user', content: userMessage }],
					temperature,
					metadata,
				};
				if (systemPrompt) body.system = systemPrompt;

				const response = await this.helpers.httpRequest({
					method: 'POST',
					url: `${endpoint}/v1/messages`,
					headers: { 'Content-Type': 'application/json', 'x-tokensense-key': apiKey },
					body,
					returnFullResponse: true,
				});

				const responseBody = response.body as {
					content?: Array<{ text?: string; type?: string }>;
					model?: string;
					usage?: { input_tokens?: number; output_tokens?: number };
					stop_reason?: string;
					tokensense?: { request_id?: string; cost_usd?: number; model?: string; provider?: string; latency_ms?: number; tokens?: { prompt?: number; completion?: number; total?: number } };
				};

				returnData.push({
					json: {
						content: responseBody.content?.[0]?.text ?? '',
						model: responseBody.model ?? model,
						usage: responseBody.usage ?? {},
						stopReason: responseBody.stop_reason ?? '',
						requestId: responseBody.tokensense?.request_id ?? '',
						cost: String(responseBody.tokensense?.cost_usd ?? ''),
						provider: responseBody.tokensense?.provider ?? '',
						latencyMs: responseBody.tokensense?.latency_ms ?? null,
						tokens: responseBody.tokensense?.tokens ?? {},
					},
				});
			} else if (operation === 'nativeGemini') {
				const model = this.getNodeParameter('geminiModel', i) as string;
				const userMessage = this.getNodeParameter('geminiUserMessage', i) as string;
				const systemInstruction = this.getNodeParameter('geminiSystemInstruction', i, '') as string;
				const temperature = this.getNodeParameter('geminiTemperature', i) as number;
				const maxOutputTokens = this.getNodeParameter('geminiMaxOutputTokens', i) as number;

				const metadata = buildMetadata(this, i);

				const generationConfig: Record<string, unknown> = { temperature };
				if (maxOutputTokens > 0) generationConfig.maxOutputTokens = maxOutputTokens;

				const body: Record<string, unknown> = {
					contents: [{ role: 'user', parts: [{ text: userMessage }] }],
					generationConfig,
					metadata,
				};
				if (systemInstruction) {
					body.systemInstruction = { parts: [{ text: systemInstruction }] };
				}

				const response = await this.helpers.httpRequest({
					method: 'POST',
					url: `${endpoint}/v1beta/models/${model}:generateContent`,
					headers: { 'Content-Type': 'application/json', 'x-tokensense-key': apiKey },
					body,
					returnFullResponse: true,
				});

				const responseBody = response.body as {
					candidates?: Array<{
						content?: { parts?: Array<{ text?: string }> };
					}>;
					usageMetadata?: Record<string, unknown>;
				};
				const responseHeaders = response.headers as Record<string, string>;

				returnData.push({
					json: {
						content: responseBody.candidates?.[0]?.content?.parts?.[0]?.text ?? '',
						usageMetadata: responseBody.usageMetadata ?? {},
						requestId: responseHeaders['x-tokensense-request-id'] ?? '',
						cost: responseHeaders['x-tokensense-cost'] ?? '',
						provider: 'google',
						model: responseHeaders['x-tokensense-model'] ?? '',
						latencyMs: null,
						tokens: {},
					},
				});
			} else if (operation === 'listModels') {
				const response = await this.helpers.httpRequest({
					method: 'GET',
					url: `${endpoint}/v1/models`,
					headers: { 'x-tokensense-key': apiKey },
					returnFullResponse: true,
				});

				const responseBody = response.body as {
					data?: Array<{ id?: string; object?: string; owned_by?: string }>;
				};

				returnData.push({
					json: {
						models: responseBody.data ?? [],
					},
				});
			}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}

export default TokenSenseAi;
