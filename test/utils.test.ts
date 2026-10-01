import { normalizeBaseUrl, buildMetadata, loadModels } from '../shared/utils';
import { TokenSenseApi } from '../credentials/TokenSenseApi.credentials';
import type { IExecuteFunctions, ILoadOptionsFunctions } from 'n8n-workflow';

describe('normalizeBaseUrl', () => {
	it('leaves a clean bare origin unchanged', () => {
		expect(normalizeBaseUrl('https://api.tokensense.io')).toBe('https://api.tokensense.io');
	});

	it('strips a single trailing slash', () => {
		expect(normalizeBaseUrl('https://api.tokensense.io/')).toBe('https://api.tokensense.io');
	});

	it('strips a trailing /v1', () => {
		expect(normalizeBaseUrl('https://api.tokensense.io/v1')).toBe('https://api.tokensense.io');
	});

	it('strips a trailing /v1/', () => {
		expect(normalizeBaseUrl('https://api.tokensense.io/v1/')).toBe('https://api.tokensense.io');
	});

	it('collapses multiple trailing slashes and /v1', () => {
		expect(normalizeBaseUrl('https://api.tokensense.io//v1//')).toBe('https://api.tokensense.io');
	});

	it('coerces non-strings and trims whitespace', () => {
		expect(normalizeBaseUrl('  https://api.tokensense.io  ')).toBe('https://api.tokensense.io');
	});
});

describe('buildMetadata', () => {
	const buildMockContext = (overrides?: {
		nodeName?: string;
		executionId?: string;
		workflowTag?: string;
		project?: string;
	}): IExecuteFunctions => {
		return {
			getNodeParameter: (name: string) => {
				if (name === 'workflowTag') return overrides?.workflowTag ?? '';
				if (name === 'project') return overrides?.project ?? '';
				if (name === 'providerOverride') return 'auto';
				return '';
			},
			getWorkflow: () => ({ name: 'Test Workflow', id: '123', active: true }),
			getNode: () => ({
				name: overrides?.nodeName ?? 'Classify Intent',
				id: 'node-1',
				type: 'n8n-nodes-tokensense.tokenSenseAi',
				typeVersion: 1,
				position: [0, 0],
				parameters: {},
			}),
			getExecutionId: () => overrides?.executionId ?? 'exec-abc-789',
		} as unknown as IExecuteFunctions;
	};

	it('includes step from getNode().name', () => {
		const ctx = buildMockContext({ nodeName: 'Classify Intent' });
		const meta = buildMetadata(ctx, 0);
		expect(meta.step).toBe('Classify Intent');
	});

	it('includes execution_id from getExecutionId()', () => {
		const ctx = buildMockContext({ executionId: 'exec-abc-789' });
		const meta = buildMetadata(ctx, 0);
		expect(meta.execution_id).toBe('exec-abc-789');
	});

	it('includes source, workflow_tag, step, and execution_id together', () => {
		const ctx = buildMockContext({ workflowTag: 'my-workflow', nodeName: 'Generate Summary' });
		const meta = buildMetadata(ctx, 0);
		expect(meta.source).toBe('n8n-nodes-tokensense');
		expect(meta.workflow_tag).toBe('my-workflow');
		expect(meta.step).toBe('Generate Summary');
		expect(meta.execution_id).toBe('exec-abc-789');
	});
});

describe('TokenSenseApi credential endpoint regex', () => {
	const getRegex = (): RegExp => {
		const cred = new TokenSenseApi();
		const endpointProp = cred.properties.find((p) => p.name === 'endpoint');
		const pattern = (endpointProp?.typeOptions as { regexp?: { regex?: string } })?.regexp?.regex;
		if (!pattern) throw new Error('endpoint regex missing');
		return new RegExp(pattern);
	};

	it('accepts a bare https origin', () => {
		expect(getRegex().test('https://api.tokensense.io')).toBe(true);
	});

	it('accepts a bare http origin (self-hosted proxies)', () => {
		expect(getRegex().test('http://localhost:8080')).toBe(true);
	});

	it('accepts a single trailing slash', () => {
		expect(getRegex().test('https://api.tokensense.io/')).toBe(true);
	});

	it('rejects a trailing /v1', () => {
		expect(getRegex().test('https://api.tokensense.io/v1')).toBe(false);
	});

	it('rejects an arbitrary path', () => {
		expect(getRegex().test('https://api.tokensense.io/foo')).toBe(false);
	});

	it('rejects nested paths', () => {
		expect(getRegex().test('https://api.tokensense.io/foo/v1')).toBe(false);
	});
});


describe('model discovery', () => {
	const context = (response?: unknown): ILoadOptionsFunctions => ({
		getCredentials: async () => ({ endpoint: 'https://api.tokensense.io' }),
		getNode: () => ({ name: 'TokenSense' }),
		helpers: { httpRequestWithAuthentication: jest.fn(async () => {
			if (!response) throw new Error('Feed unavailable');
			return response;
		}) },
	} as unknown as ILoadOptionsFunctions);
	it('falls back to current choices across every integrated chat provider', async () => {
		const options = await loadModels.call(context());
		const values = options.map((option) => option.value);
		for (const id of ['gpt-6.1-sol', 'claude-sonnet-5-5', 'gemini-3.8-flash', 'grok-4.7', 'mistral-medium-3-5', 'kimi-k3']) expect(values).toContain(id);
		expect(values).not.toContain('gemini-3.1-flash-lite-preview');
	});
	it('uses the fallback for an empty catalog and labels endpoint restrictions', async () => {
		expect((await loadModels.call(context({ data: [] }))).length).toBeGreaterThan(0);
		expect(await loadModels.call(context({ data: [{ id: 'gpt-6.1-sol' }] }))).toEqual([{ name: 'gpt-6.1-sol (tools require Responses)', value: 'gpt-6.1-sol' }]);
	});
	it('preserves API identifiers and custom embedding fallback', async () => {
		expect(await loadModels.call(context({ data: [{ id: 'custom-current-model' }] }))).toEqual([{ name: 'custom-current-model', value: 'custom-current-model' }]);
		const fallback = [{ name: 'Embed', value: 'text-embedding-3-small' }];
		expect(await loadModels.call(context({ data: [{ id: 'chat-only' }] }), (id) => id.includes('embedding'), fallback)).toEqual(fallback);
	});
});
