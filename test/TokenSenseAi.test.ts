import { TokenSenseAi } from '../nodes/TokenSenseAi/TokenSenseAi.node';
import type { IExecuteFunctions } from 'n8n-workflow';

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

	describe('nativeGemini operation', () => {
		it('sends API key in header, not URL query param', async () => {
			let capturedUrl = '';
			let capturedHeaders: Record<string, string> = {};

			const mockContext = {
				getInputData: () => [{ json: {} }],
				getNodeParameter: (name: string) => {
					const params: Record<string, unknown> = {
						operation: 'nativeGemini',
						geminiModel: 'gemini-2.0-flash',
						geminiUserMessage: 'hello',
						geminiSystemInstruction: '',
						geminiTemperature: 1.0,
						geminiMaxOutputTokens: 0,
						project: '',
						workflowTag: '',
					};
					return params[name] ?? '';
				},
				getCredentials: async () => ({
					endpoint: 'https://api.tokensense.io',
					apiKey: 'test-secret-key',
				}),
				getWorkflow: () => ({ name: 'Test Workflow', id: '123', active: true }),
				continueOnFail: () => false,
				helpers: {
					httpRequest: async (opts: { url: string; headers: Record<string, string> }) => {
						capturedUrl = opts.url;
						capturedHeaders = opts.headers;
						return {
							body: { candidates: [{ content: { parts: [{ text: 'hi' }] } }] },
							headers: {},
							statusCode: 200,
						};
					},
				},
			} as unknown as IExecuteFunctions;

			await node.execute.call(mockContext);

			expect(capturedUrl).not.toContain('key=');
			expect(capturedUrl).not.toContain('test-secret-key');
			expect(capturedHeaders['x-tokensense-key']).toBe('test-secret-key');
		});

		it('reads metadata from response headers (not body)', async () => {
			const mockContext = {
				getInputData: () => [{ json: {} }],
				getNodeParameter: (name: string) => {
					const params: Record<string, unknown> = {
						operation: 'nativeGemini',
						geminiModel: 'gemini-2.0-flash',
						geminiUserMessage: 'hello',
						geminiSystemInstruction: '',
						geminiTemperature: 1.0,
						geminiMaxOutputTokens: 0,
						project: '',
						workflowTag: '',
					};
					return params[name] ?? '';
				},
				getCredentials: async () => ({
					endpoint: 'https://api.tokensense.io',
					apiKey: 'test-key',
				}),
				getWorkflow: () => ({ name: 'Test Workflow', id: '123', active: true }),
				continueOnFail: () => false,
				helpers: {
					httpRequest: async () => ({
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
					}),
				},
			} as unknown as IExecuteFunctions;

			const result = await node.execute.call(mockContext);
			const output = result[0][0].json;

			expect(output.requestId).toBe('req_abc');
			expect(output.cost).toBe('0.001');
			expect(output.model).toBe('gemini-2.0-flash');
			expect(output.provider).toBe('google');
		});
	});

	describe('chatCompletion metadata parsing', () => {
		it('reads metadata from tokensense field in response body', async () => {
			const mockContext = {
				getInputData: () => [{ json: {} }],
				getNodeParameter: (name: string) => {
					const params: Record<string, unknown> = {
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
					};
					return params[name] ?? '';
				},
				getCredentials: async () => ({
					endpoint: 'https://api.tokensense.io',
					apiKey: 'test-key',
				}),
				getWorkflow: () => ({ name: 'Test Workflow', id: '123', active: true }),
				continueOnFail: () => false,
				helpers: {
					httpRequest: async () => ({
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
					}),
				},
			} as unknown as IExecuteFunctions;

			const result = await node.execute.call(mockContext);
			const output = result[0][0].json;

			expect(output.requestId).toBe('req_xyz');
			expect(output.cost).toBe('0.002');
			expect(output.provider).toBe('openai');
			expect(output.latencyMs).toBe(300);
			expect(output.tokens).toEqual({ prompt: 10, completion: 5, total: 15 });
		});
	});
});
