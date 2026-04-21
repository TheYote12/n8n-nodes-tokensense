import { normalizeBaseUrl, buildMetadata } from '../shared/utils';
import { TokenSenseApi } from '../credentials/TokenSenseApi.credentials';
import type { IExecuteFunctions } from 'n8n-workflow';

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
