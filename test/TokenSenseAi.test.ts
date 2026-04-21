import { TokenSenseAi } from '../nodes/TokenSenseAi/TokenSenseAi.node';
import type { IExecuteFunctions, IHttpRequestOptions } from 'n8n-workflow';

describe('TokenSenseAi node', () => {
	let node: TokenSenseAi;

	beforeEach(() => {
		node = new TokenSenseAi();
	});

	const getOperationValues = (n: TokenSenseAi): string[] => {
		const operationProp = n.description.properties.find((p) => p.name === 'operation');
		return ((operationProp?.options as Array<{ value: string }>) ?? []).map((o) => o.value);
	};

	it('has displayName "TokenSense AI"', () => {
		expect(node.description.displayName).toBe('TokenSense AI');
	});

	it('has name "tokenSenseAi"', () => {
		expect(node.description.name).toBe('tokenSenseAi');
	});

	it('defines exactly 8 operations', () => {
		expect(getOperationValues(node)).toHaveLength(8);
	});

	it('includes chatCompletion operation', () => {
		expect(getOperationValues(node)).toContain('chatCompletion');
	});

	it('includes generateImage operation', () => {
		expect(getOperationValues(node)).toContain('generateImage');
	});

	it('includes createEmbedding operation', () => {
		expect(getOperationValues(node)).toContain('createEmbedding');
	});

	it('includes textToSpeech operation', () => {
		expect(getOperationValues(node)).toContain('textToSpeech');
	});

	it('includes transcribeAudio operation', () => {
		expect(getOperationValues(node)).toContain('transcribeAudio');
	});

	it('includes nativeAnthropic operation', () => {
		expect(getOperationValues(node)).toContain('nativeAnthropic');
	});

	it('includes nativeGemini operation', () => {
		expect(getOperationValues(node)).toContain('nativeGemini');
	});

	it('includes listModels operation', () => {
		expect(getOperationValues(node)).toContain('listModels');
	});

	it('is usable as an AI Agent tool', () => {
		expect(node.description.usableAsTool).toBe(true);
	});

	it('chatCompletion model property has displayOptions configured', () => {
		const modelProp = node.description.properties.find(
			(p) => p.name === 'model' && p.displayOptions?.show?.operation,
		);
		const ops = modelProp?.displayOptions?.show?.operation as string[] | undefined;
		expect(ops).toContain('chatCompletion');
	});

	it('operation-specific properties have displayOptions', () => {
		const propsWithDisplayOptions = node.description.properties.filter(
			(p) => p.name !== 'operation' && p.displayOptions,
		);
		expect(propsWithDisplayOptions.length).toBeGreaterThan(0);
	});

	it('workflowTag description mentions auto-detection', () => {
		const prop = node.description.properties.find((p) => p.name === 'workflowTag');
		expect(prop?.description).toMatch(/auto/i);
	});

	it('has execute method', () => {
		expect(typeof node.execute).toBe('function');
	});

	it('requires tokenSenseApi credential', () => {
		const creds = node.description.credentials ?? [];
		expect(creds.some((c) => c.name === 'tokenSenseApi')).toBe(true);
	});

	it('has loadOptions.getModels method', () => {
		expect(typeof node.methods?.loadOptions?.getModels).toBe('function');
	});

	/**
	 * Build a mock IExecuteFunctions whose httpRequestWithAuthentication captures
	 * every call into `captured` and returns the supplied response.
	 *
	 * Sprint 2 contract:
	 *  - Node code MUST call `helpers.httpRequestWithAuthentication` (NOT `httpRequest`)
	 *    so n8n injects the x-tokensense-key header from the credential authenticate block.
	 *  - Node code MUST NOT pass a manual `x-tokensense-key` or `Authorization` header.
	 *  - For JSON ops the code MUST pass `returnFullResponse: true` and read `.body`.
	 */
	const buildMockContext = (
		params: Record<string, unknown>,
		response: unknown,
		captured: {
			credentialName?: string;
			opts?: IHttpRequestOptions;
		},
	): IExecuteFunctions => {
		const mockFn = function (credentialName: string, opts: IHttpRequestOptions): Promise<unknown> {
			captured.credentialName = credentialName;
			captured.opts = opts;
			return Promise.resolve(response);
		};
		return {
			getInputData: () => [{ json: {} }],
			getNodeParameter: (name: string) => params[name] ?? '',
			getCredentials: async () => ({
				endpoint: 'https://api.tokensense.io',
				apiKey: 'test-secret-key',
			}),
			getWorkflow: () => ({ name: 'Test Workflow', id: '123', active: true }),
			getNode: () => ({ name: 'Test Node', id: 'test-node-id', type: 'n8n-nodes-tokensense.tokenSenseAi', typeVersion: 1, position: [0, 0], parameters: {} }),
			getExecutionId: () => 'exec-test-12345',
			continueOnFail: () => false,
			helpers: {
				httpRequestWithAuthentication: mockFn,
			},
		} as unknown as IExecuteFunctions;
	};

	describe('auth contract (Sprint 2 refactor)', () => {
		it('chatCompletion delegates auth to n8n credential system', async () => {
			const captured: { credentialName?: string; opts?: IHttpRequestOptions } = {};
			const ctx = buildMockContext(
				{
					operation: 'chatCompletion',
					model: 'gpt-4o',
					userMessage: 'hello',
					temperature: 0.7,
					maxTokens: 0,
					jsonMode: false,
					providerOverride: 'auto',
				},
				{
					body: {
						choices: [{ message: { content: 'hi', role: 'assistant' } }],
						model: 'gpt-4o',
						usage: {},
						tokensense: { request_id: 'r', cost_usd: 0, provider: 'openai' },
					},
					headers: {},
					statusCode: 200,
				},
				captured,
			);

			await node.execute.call(ctx);

			expect(captured.credentialName).toBe('tokenSenseApi');
			const opts = captured.opts!;
			// Must go through httpRequestWithAuthentication, not embed the key
			const headers = (opts.headers ?? {}) as Record<string, string>;
			expect(headers['x-tokensense-key']).toBeUndefined();
			expect(headers.Authorization).toBeUndefined();
			expect(headers.authorization).toBeUndefined();
			// URL must not contain the secret
			const fullUrl = `${opts.baseURL ?? ''}${opts.url ?? ''}`;
			expect(fullUrl).not.toContain('test-secret-key');
			expect(fullUrl).not.toContain('key=');
			// Body contract: returnFullResponse must be set so node can read .body
			expect(opts.returnFullResponse).toBe(true);
		});

		it('nativeGemini sends key via credential header, not URL query param', async () => {
			const captured: { credentialName?: string; opts?: IHttpRequestOptions } = {};
			const ctx = buildMockContext(
				{
					operation: 'nativeGemini',
					geminiModel: 'gemini-2.0-flash',
					geminiUserMessage: 'hello',
					geminiSystemInstruction: '',
					geminiTemperature: 1.0,
					geminiMaxOutputTokens: 0,
				},
				{
					body: { candidates: [{ content: { parts: [{ text: 'hi' }] } }] },
					headers: {},
					statusCode: 200,
				},
				captured,
			);

			await node.execute.call(ctx);

			const opts = captured.opts!;
			const fullUrl = `${opts.baseURL ?? ''}${opts.url ?? ''}`;
			expect(fullUrl).not.toContain('key=');
			expect(fullUrl).not.toContain('test-secret-key');
			const headers = (opts.headers ?? {}) as Record<string, string>;
			expect(headers['x-tokensense-key']).toBeUndefined();
			expect(captured.credentialName).toBe('tokenSenseApi');
		});

		it('nativeAnthropic uses credential helper and reads .body', async () => {
			const captured: { credentialName?: string; opts?: IHttpRequestOptions } = {};
			const ctx = buildMockContext(
				{
					operation: 'nativeAnthropic',
					anthropicModel: 'claude-sonnet-4-5-20250929',
					anthropicUserMessage: 'hi',
					anthropicSystemPrompt: '',
					anthropicMaxTokens: 1024,
				},
				{
					body: { content: [{ text: 'hello', type: 'text' }] },
					headers: { 'x-tokensense-request-id': 'req_a', 'x-tokensense-cost': '0.001' },
					statusCode: 200,
				},
				captured,
			);

			await node.execute.call(ctx);

			expect(captured.credentialName).toBe('tokenSenseApi');
			expect(captured.opts!.returnFullResponse).toBe(true);
			expect(captured.opts!.url).toBe('/v1/messages');
		});

		it('transcribeAudio uses n8n built-in multipart (no form-data package)', async () => {
			const captured: { credentialName?: string; opts?: IHttpRequestOptions } = {};
			const ctx = {
				getInputData: () => [
					{
						json: {},
						binary: {
							data: {
								data: Buffer.from('fake-audio').toString('base64'),
								mimeType: 'audio/mp3',
								fileName: 'a.mp3',
							},
						},
					},
				],
				getNodeParameter: (name: string) => {
					const params: Record<string, unknown> = {
						operation: 'transcribeAudio',
						binaryPropertyName: 'data',
						sttModel: 'whisper-1',
						sttLanguage: '',
						sttFormat: 'json',
					};
					return params[name] ?? '';
				},
				getCredentials: async () => ({
					endpoint: 'https://api.tokensense.io',
					apiKey: 'test-secret-key',
				}),
				getWorkflow: () => ({ name: 'Test Workflow', id: '123', active: true }),
				getNode: () => ({ name: 'Test Node', id: 'test-node-id', type: 'n8n-nodes-tokensense.tokenSenseAi', typeVersion: 1, position: [0, 0], parameters: {} }),
				getExecutionId: () => 'exec-test-12345',
				continueOnFail: () => false,
				helpers: {
					httpRequestWithAuthentication: function (
						credentialName: string,
						opts: IHttpRequestOptions,
					) {
						captured.credentialName = credentialName;
						captured.opts = opts;
						return Promise.resolve({
							body: { text: 'transcribed' },
							headers: {},
							statusCode: 200,
						});
					},
					getBinaryDataBuffer: async () => Buffer.from('fake-audio'),
				},
			} as unknown as IExecuteFunctions;

			await node.execute.call(ctx);

			const opts = captured.opts!;
			const headers = (opts.headers ?? {}) as Record<string, string>;
			expect(headers['Content-Type']).toBe('multipart/form-data');
			const body = opts.body as Record<string, unknown>;
			expect(body).toBeDefined();
			expect(body.file).toBeDefined();
			// n8n multipart shape: { value, options: { filename, contentType } }
			expect((body.file as { options: { filename: string } }).options.filename).toBe('a.mp3');
			expect(body.model).toBe('whisper-1');
			expect(opts.returnFullResponse).toBe(true);
		});
	});

	describe('nativeGemini metadata parsing', () => {
		it('reads metadata from response headers (not body)', async () => {
			const captured: { credentialName?: string; opts?: IHttpRequestOptions } = {};
			const ctx = buildMockContext(
				{
					operation: 'nativeGemini',
					geminiModel: 'gemini-2.0-flash',
					geminiUserMessage: 'hello',
					geminiSystemInstruction: '',
					geminiTemperature: 1.0,
					geminiMaxOutputTokens: 0,
				},
				{
					body: {
						candidates: [{ content: { parts: [{ text: 'response' }] } }],
						usageMetadata: { promptTokenCount: 5 },
					},
					headers: {
						'x-tokensense-request-id': 'req_abc',
						'x-tokensense-cost': '0.001',
						'x-tokensense-model': 'gemini-2.0-flash',
					},
					statusCode: 200,
				},
				captured,
			);

			const result = await node.execute.call(ctx);
			const output = result[0][0].json;

			expect(output.requestId).toBe('req_abc');
			expect(output.cost).toBe('0.001');
			expect(output.model).toBe('gemini-2.0-flash');
			expect(output.provider).toBe('google');
		});
	});

	describe('chatCompletion metadata parsing', () => {
		it('reads metadata from tokensense field in response body', async () => {
			const captured: { credentialName?: string; opts?: IHttpRequestOptions } = {};
			const ctx = buildMockContext(
				{
					operation: 'chatCompletion',
					model: 'gpt-4o',
					systemPrompt: '',
					userMessage: 'hello',
					temperature: 0.7,
					maxTokens: 0,
					jsonMode: false,
					project: 'myproject',
					workflowTag: '',
					providerOverride: 'auto',
				},
				{
					body: {
						choices: [{ message: { content: 'hi', role: 'assistant' } }],
						model: 'gpt-4o',
						usage: { prompt_tokens: 10, completion_tokens: 5 },
						tokensense: {
							request_id: 'req_xyz',
							cost_usd: 0.002,
							model: 'gpt-4o',
							provider: 'openai',
							latency_ms: 300,
							tokens: { prompt: 10, completion: 5, total: 15 },
						},
					},
					headers: {},
					statusCode: 200,
				},
				captured,
			);

			const result = await node.execute.call(ctx);
			const output = result[0][0].json;

			expect(output.requestId).toBe('req_xyz');
			expect(output.cost).toBe('0.002');
			expect(output.provider).toBe('openai');
			expect(output.latencyMs).toBe(300);
			expect(output.tokens).toEqual({ prompt: 10, completion: 5, total: 15 });
		});
	});
});
