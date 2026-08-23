import type { IExecuteFunctions, INode } from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';
import { TokenSenseAi } from '../nodes/TokenSenseAi/TokenSenseAi.node';
import {
	buildErrorDescription,
	buildErrorOutput,
	buildTokenSenseApiError,
	extractHttpStatus,
	extractTokenSenseErrorEnvelope,
	isTerminalAttempt,
	makeTokenSenseFailedAttemptHandler,
} from '../shared/errors';

/**
 * Canned per-status strings from n8n-workflow's STATUS_CODE_MESSAGES map
 * (errors/node-api.error.js). These are what NodeApiError substitutes for the
 * response body's message when no `message` override is passed — the exact
 * regression this suite guards against.
 */
const CANNED_402 = 'Payment required - perhaps check your payment details?';
const CANNED_503 =
	'Service unavailable - try again later or consider setting this node to retry automatically (in the node settings)';

const NODE: INode = {
	name: 'Test Node',
	id: 'test-node-id',
	type: 'n8n-nodes-tokensense.tokenSenseAi',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

const ENVELOPE_402 = {
	code: 'budget_exceeded',
	error_class: 'budget_exceeded',
	message: 'Budget exceeded for project scene3d: $50.00 of $50.00 cap spent',
	type: 'billing_error',
	retryable: false,
	retry_after_seconds: null,
	scope: 'project:scene3d',
	budget_usd: 50,
	spent_usd: 50,
};

const ENVELOPE_503 = {
	code: 'budget_check_unavailable',
	error_class: 'budget_check_unavailable',
	message: 'Budget ledger is temporarily unreachable; request was not billed',
	type: 'infrastructure_error',
	retryable: true,
	retry_after_seconds: 30,
	scope: 'project:scene3d',
	budget_usd: null,
	spent_usd: null,
};

/** n8n `httpRequest` helper shape: body hangs off `error.response.body`. */
const n8nHelperError = (status: number, envelope?: Record<string, unknown>) =>
	Object.assign(new Error(`Request failed with status code ${status}`), {
		statusCode: status,
		// Omitting the envelope models a gateway/proxy failure whose body carries no
		// TokenSense error object (an HTML error page, an empty body, an older deploy).
		response: { statusCode: status, body: envelope ? { error: envelope } : {} },
	});

/** Raw axios shape: body hangs off `error.response.data`. */
const axiosError = (status: number, envelope: Record<string, unknown>) =>
	Object.assign(new Error(`Request failed with status code ${status}`), {
		isAxiosError: true,
		response: { status, data: { error: envelope } },
	});

/** `openai` SDK APIError shape: the body's `error` is assigned onto `.error`. */
const openAiApiError = (status: number, envelope: Record<string, unknown>) =>
	Object.assign(new Error(`${status} ${envelope.message as string}`), {
		status,
		error: envelope,
	});

const buildFailingContext = (
	error: unknown,
	continueOnFail: boolean,
): IExecuteFunctions =>
	({
		getInputData: () => [{ json: {} }],
		getNodeParameter: (name: string) => {
			const params: Record<string, unknown> = {
				operation: 'chatCompletion',
				model: 'gpt-4.1-mini',
				systemPrompt: '',
				userMessage: 'hello',
				temperature: 0.7,
				maxTokens: 0,
				jsonMode: false,
				providerOverride: 'auto',
			};
			return params[name] ?? '';
		},
		getCredentials: async () => ({
			endpoint: 'https://api.tokensense.io',
			apiKey: 'test-secret-key',
		}),
		getWorkflow: () => ({ name: 'Test Workflow', id: '123', active: true }),
		getNode: () => NODE,
		getExecutionId: () => 'exec-test-12345',
		continueOnFail: () => continueOnFail,
		helpers: {
			httpRequestWithAuthentication: () => Promise.reject(error),
		},
	}) as unknown as IExecuteFunctions;

describe('extractTokenSenseErrorEnvelope', () => {
	it('reads the envelope from error.response.body.error (n8n helper)', () => {
		const envelope = extractTokenSenseErrorEnvelope(n8nHelperError(402, ENVELOPE_402));
		expect(envelope?.error_class).toBe('budget_exceeded');
		expect(envelope?.retryable).toBe(false);
		expect(envelope?.scope).toBe('project:scene3d');
	});

	it('reads the envelope from error.response.data.error (axios)', () => {
		const envelope = extractTokenSenseErrorEnvelope(axiosError(503, ENVELOPE_503));
		expect(envelope?.error_class).toBe('budget_check_unavailable');
		expect(envelope?.retry_after_seconds).toBe(30);
	});

	it('reads the envelope from error.error (openai SDK / request-promise)', () => {
		const envelope = extractTokenSenseErrorEnvelope(openAiApiError(402, ENVELOPE_402));
		expect(envelope?.error_class).toBe('budget_exceeded');
		expect(envelope?.budget_usd).toBe(50);
	});

	it('reads a doubly-nested envelope at error.error.error', () => {
		const error = Object.assign(new Error('boom'), {
			statusCode: 402,
			error: { error: ENVELOPE_402 },
		});
		expect(extractTokenSenseErrorEnvelope(error)?.error_class).toBe('budget_exceeded');
	});

	it('returns undefined for a plain error with no envelope', () => {
		expect(extractTokenSenseErrorEnvelope(new Error('socket hang up'))).toBeUndefined();
		expect(extractTokenSenseErrorEnvelope(undefined)).toBeUndefined();
	});

	it('does not mistake an arbitrary nested object for an envelope', () => {
		const error = Object.assign(new Error('boom'), {
			response: { statusCode: 500, body: { error: { detail: 'nope' } } },
		});
		expect(extractTokenSenseErrorEnvelope(error)).toBeUndefined();
	});
});

describe('extractHttpStatus', () => {
	it('reads response.statusCode, response.status and top-level statusCode', () => {
		expect(extractHttpStatus(n8nHelperError(402, ENVELOPE_402))).toBe(402);
		expect(extractHttpStatus(axiosError(503, ENVELOPE_503))).toBe(503);
		expect(extractHttpStatus(openAiApiError(402, ENVELOPE_402))).toBe(402);
	});

	it('coerces a string status', () => {
		expect(extractHttpStatus({ statusCode: '429' })).toBe(429);
	});

	it('returns undefined when there is no status anywhere', () => {
		expect(extractHttpStatus(new Error('socket hang up'))).toBeUndefined();
	});
});

describe('buildErrorDescription', () => {
	it('renders error_class, retryable and retry_after_seconds', () => {
		expect(buildErrorDescription(extractTokenSenseErrorEnvelope(axiosError(503, ENVELOPE_503)))).toBe(
			'error_class=budget_check_unavailable · retryable=true · retry_after_seconds=30',
		);
	});

	it('returns undefined without an error_class', () => {
		expect(buildErrorDescription(undefined)).toBeUndefined();
		expect(buildErrorDescription({ message: 'x' })).toBeUndefined();
	});
});

describe('buildTokenSenseApiError', () => {
	it('defeats the canned 402 message', () => {
		const apiError = buildTokenSenseApiError(NODE, n8nHelperError(402, ENVELOPE_402), {
			itemIndex: 0,
		});
		expect(apiError).toBeInstanceOf(NodeApiError);
		expect(apiError.message).not.toBe(CANNED_402);
		expect(apiError.message).toBe(ENVELOPE_402.message);
		expect(apiError.httpCode).toBe('402');
		expect(apiError.description).toContain('error_class=budget_exceeded');
	});

	it('defeats the canned 503 message', () => {
		const apiError = buildTokenSenseApiError(NODE, axiosError(503, ENVELOPE_503), { itemIndex: 0 });
		expect(apiError.message).not.toBe(CANNED_503);
		expect(apiError.message).toBe(ENVELOPE_503.message);
		expect(apiError.httpCode).toBe('503');
		expect(apiError.description).toBe(
			'error_class=budget_check_unavailable · retryable=true · retry_after_seconds=30',
		);
	});

	it('regression: the unpatched call really does produce the canned strings', () => {
		// Guards the premise of this whole suite — if n8n ever stops substituting,
		// these assertions fail loudly rather than the patch quietly becoming a no-op.
		expect(new NodeApiError(NODE, n8nHelperError(402, ENVELOPE_402) as never).message).toBe(
			CANNED_402,
		);
		expect(new NodeApiError(NODE, axiosError(503, ENVELOPE_503) as never).message).toBe(CANNED_503);
	});

	it('enriches an error that is already a NodeApiError', () => {
		// Some n8n transports wrap before we see the error. NodeApiError's constructor
		// then returns the instance verbatim and drops the overrides, so we re-assert
		// them by hand; the envelope is recovered from `context.data`, which
		// NodeApiError copies off an axios-shaped response.
		const preWrapped = new NodeApiError(NODE, axiosError(503, ENVELOPE_503) as never);
		expect(preWrapped.message).toBe(CANNED_503);

		const apiError = buildTokenSenseApiError(NODE, preWrapped, { itemIndex: 0 });
		expect(apiError).toBe(preWrapped);
		expect(apiError.message).toBe(ENVELOPE_503.message);
		expect(apiError.description).toContain('error_class=budget_check_unavailable');
		expect(apiError.httpCode).toBe('503');
	});

	it('leaves the canned message alone when n8n has already destroyed the body', () => {
		// Documented limit: NodeError blanks `cause` for Error inputs and only copies
		// `context.data` for axios-shaped ones, so an already-wrapped n8n-helper error
		// has no recoverable envelope. This node wraps the raw error itself, so this
		// path is defensive only — but it must not make things worse.
		const preWrapped = new NodeApiError(NODE, n8nHelperError(402, ENVELOPE_402) as never);
		const apiError = buildTokenSenseApiError(NODE, preWrapped, { itemIndex: 0 });
		expect(apiError).toBe(preWrapped);
		expect(apiError.message).toBe(CANNED_402);
		expect(apiError.httpCode).toBe('402');
	});

	// Codex review (PR #24, P2): with no TokenSense envelope there is no message worth
	// preserving, and overriding with the transport's text SUPPRESSES n8n's more
	// actionable status message. Only defeat the canned map when it would bury a real
	// TokenSense message.
	it('preserves n8n\'s actionable status message when there is no envelope', () => {
		const apiError = buildTokenSenseApiError(NODE, n8nHelperError(401), { itemIndex: 0 });
		expect(apiError.message).toBe('Authorization failed - please check your credentials');
		expect(apiError.message).not.toBe('Request failed with status code 401');
		// n8n demotes the raw transport text to `description` — we add nothing of our own,
		// so nothing of ours can bury it.
		expect(apiError.description).toBe('Request failed with status code 401');
		expect(apiError.httpCode).toBe('401');
	});

	it('preserves n8n\'s canned text for a transport error with no status', () => {
		const apiError = buildTokenSenseApiError(NODE, new Error('socket hang up'), { itemIndex: 0 });
		// No envelope and no status: we add nothing, so whatever NodeApiError decides stands.
		expect(apiError.description).toBeUndefined();
	});

	it('still defeats the canned map when an envelope IS present', () => {
		const apiError = buildTokenSenseApiError(NODE, n8nHelperError(401, {
			code: 'INVALID_API_KEY',
			message: 'Invalid or revoked TokenSense API key.',
			type: 'authentication_error',
		}), { itemIndex: 0 });
		expect(apiError.message).toBe('Invalid or revoked TokenSense API key.');
	});
});

describe('buildErrorOutput', () => {
	it('produces branchable fields for a 402', () => {
		const error = n8nHelperError(402, ENVELOPE_402);
		expect(buildErrorOutput(error, extractTokenSenseErrorEnvelope(error))).toEqual({
			message: ENVELOPE_402.message,
			code: 'budget_exceeded',
			error_class: 'budget_exceeded',
			retryable: false,
			retry_after_seconds: null,
			http_status: 402,
			scope: 'project:scene3d',
			budget_usd: 50,
			spent_usd: 50,
		});
	});

	it('produces branchable fields for a 503', () => {
		const error = axiosError(503, ENVELOPE_503);
		expect(buildErrorOutput(error, extractTokenSenseErrorEnvelope(error))).toEqual({
			message: ENVELOPE_503.message,
			code: 'budget_check_unavailable',
			error_class: 'budget_check_unavailable',
			retryable: true,
			retry_after_seconds: 30,
			http_status: 503,
			scope: 'project:scene3d',
		});
	});

	it('nulls every core field when there is no envelope', () => {
		expect(buildErrorOutput(new Error('socket hang up'))).toEqual({
			message: 'socket hang up',
			code: null,
			error_class: null,
			retryable: null,
			retry_after_seconds: null,
			http_status: null,
			scope: null,
		});
	});
});

describe('TokenSenseAi execute() — thrown path', () => {
	const node = new TokenSenseAi();

	it('surfaces the 402 envelope instead of the canned n8n string', async () => {
		const ctx = buildFailingContext(n8nHelperError(402, ENVELOPE_402), false);
		const thrown = await node.execute.call(ctx).then(
			() => {
				throw new Error('expected execute() to reject');
			},
			(error: NodeApiError) => error,
		);

		expect(thrown).toBeInstanceOf(NodeApiError);
		expect(thrown.message).not.toBe(CANNED_402);
		expect(thrown.message).toBe(ENVELOPE_402.message);
		expect(thrown.httpCode).toBe('402');
		expect(thrown.description).toContain('error_class=budget_exceeded');
		expect(thrown.description).toContain('retryable=false');
		expect(thrown.description).toContain('retry_after_seconds=null');
		expect(thrown.context.itemIndex).toBe(0);
	});

	it('surfaces the 503 envelope instead of the canned n8n string', async () => {
		const ctx = buildFailingContext(axiosError(503, ENVELOPE_503), false);
		const thrown = await node.execute.call(ctx).then(
			() => {
				throw new Error('expected execute() to reject');
			},
			(error: NodeApiError) => error,
		);

		expect(thrown.message).not.toBe(CANNED_503);
		expect(thrown.message).toBe(ENVELOPE_503.message);
		expect(thrown.httpCode).toBe('503');
		expect(thrown.description).toContain('error_class=budget_check_unavailable');
		expect(thrown.description).toContain('retryable=true');
		expect(thrown.description).toContain('retry_after_seconds=30');
	});
});

describe('TokenSenseAi execute() — continue-on-fail path', () => {
	const node = new TokenSenseAi();

	it('emits a structured 402 error a workflow can branch on', async () => {
		const ctx = buildFailingContext(n8nHelperError(402, ENVELOPE_402), true);
		const output = (await node.execute.call(ctx))[0][0];
		const error = output.json.error as Record<string, unknown>;

		expect(error.error_class).toBe('budget_exceeded');
		expect(error.retryable).toBe(false);
		expect(error.retry_after_seconds).toBeNull();
		expect(error.http_status).toBe(402);
		expect(error.scope).toBe('project:scene3d');
		expect(error.message).toBe(ENVELOPE_402.message);
		expect(error.message).not.toBe(CANNED_402);
		expect(output.pairedItem).toEqual({ item: 0 });
	});

	it('emits a structured 503 error a workflow can branch on', async () => {
		const ctx = buildFailingContext(axiosError(503, ENVELOPE_503), true);
		const output = (await node.execute.call(ctx))[0][0];
		const error = output.json.error as Record<string, unknown>;

		expect(error.error_class).toBe('budget_check_unavailable');
		expect(error.retryable).toBe(true);
		expect(error.retry_after_seconds).toBe(30);
		expect(error.http_status).toBe(503);
		expect(error.message).not.toBe(CANNED_503);
	});

	it('keeps a top-level message string for back-compat', async () => {
		const ctx = buildFailingContext(n8nHelperError(402, ENVELOPE_402), true);
		const output = (await node.execute.call(ctx))[0][0];
		expect(output.json.errorMessage).toBe(ENVELOPE_402.message);
	});

	it('still emits a usable payload when there is no envelope', async () => {
		const ctx = buildFailingContext(new Error('socket hang up'), true);
		const output = (await node.execute.call(ctx))[0][0];
		const error = output.json.error as Record<string, unknown>;
		expect(error.message).toBe('socket hang up');
		expect(error.error_class).toBeNull();
	});
});

describe('isTerminalAttempt', () => {
	it('treats a no-retry status as terminal even with retries left', () => {
		expect(isTerminalAttempt({ ...openAiApiError(402, ENVELOPE_402), retriesLeft: 5 })).toBe(true);
	});

	it('treats a retryable status with retries left as non-terminal', () => {
		expect(isTerminalAttempt({ ...openAiApiError(503, ENVELOPE_503), retriesLeft: 2 })).toBe(false);
	});

	it('treats exhausted retries as terminal', () => {
		expect(isTerminalAttempt({ ...openAiApiError(503, ENVELOPE_503), retriesLeft: 0 })).toBe(true);
	});

	it('treats a missing retry count as terminal, matching the SDK check', () => {
		expect(isTerminalAttempt(openAiApiError(503, ENVELOPE_503))).toBe(true);
	});
});

describe('chat-model path — onFailedAttempt handler', () => {
	const handler = makeTokenSenseFailedAttemptHandler(() => NODE);

	const capture = (error: unknown): unknown => {
		try {
			handler(error);
		} catch (thrown) {
			return thrown;
		}
		return undefined;
	};

	it('throws an enriched NodeApiError for a 402 instead of the canned string', () => {
		const thrown = capture({ ...openAiApiError(402, ENVELOPE_402), retriesLeft: 5 }) as NodeApiError;
		expect(thrown).toBeInstanceOf(NodeApiError);
		expect(thrown.message).not.toBe(CANNED_402);
		expect(thrown.message).toBe(ENVELOPE_402.message);
		expect(thrown.httpCode).toBe('402');
		expect(thrown.description).toContain('error_class=budget_exceeded');
		expect(thrown.description).toContain('retryable=false');
		expect(thrown.description).toContain('retry_after_seconds=null');
	});

	it('throws an enriched NodeApiError for an exhausted 503', () => {
		const thrown = capture({ ...openAiApiError(503, ENVELOPE_503), retriesLeft: 0 }) as NodeApiError;
		expect(thrown).toBeInstanceOf(NodeApiError);
		expect(thrown.message).not.toBe(CANNED_503);
		expect(thrown.message).toBe(ENVELOPE_503.message);
		expect(thrown.httpCode).toBe('503');
		expect(thrown.description).toContain('error_class=budget_check_unavailable');
		expect(thrown.description).toContain('retryable=true');
		expect(thrown.description).toContain('retry_after_seconds=30');
	});

	it('does not interfere while the SDK still has retries left', () => {
		expect(capture({ ...openAiApiError(503, ENVELOPE_503), retriesLeft: 2 })).toBeUndefined();
	});

	it('does not interfere with errors that carry no TokenSense envelope', () => {
		expect(capture(Object.assign(new Error('Request was aborted.'), { name: 'AbortError' }))).toBeUndefined();
		expect(capture(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }))).toBeUndefined();
	});

	it('survives the SDK re-wrapping it in NodeApiError', () => {
		// makeN8nLlmFailedAttemptHandler catches whatever onFailedAttempt throws and
		// calls `new NodeApiError(node, e, { functionality: 'configuration-node' })`.
		// NodeApiError's constructor returns the argument verbatim when it is already
		// a NodeApiError, so our overrides reach the user unchanged.
		const thrown = capture({ ...openAiApiError(402, ENVELOPE_402), retriesLeft: 0 }) as NodeApiError;
		const reWrapped = new NodeApiError(NODE, thrown as never, {
			functionality: 'configuration-node',
		});

		expect(reWrapped).toBe(thrown);
		expect(reWrapped.message).toBe(ENVELOPE_402.message);
		expect(reWrapped.message).not.toBe(CANNED_402);
		expect(reWrapped.description).toContain('error_class=budget_exceeded');
	});

	it('degrades to description-only if the SDK ever holds a separate NodeApiError class', () => {
		// If `instanceof` ever fails (two n8n-workflow copies), the SDK re-wraps for
		// real. The message reverts to the canned string, but `description` is copied
		// off the error object, so error_class still survives. Simulated by wrapping a
		// plain object that carries our message/description rather than the instance.
		const thrown = capture({ ...openAiApiError(402, ENVELOPE_402), retriesLeft: 0 }) as NodeApiError;
		const reWrapped = new NodeApiError(
			NODE,
			{ message: thrown.message, description: thrown.description, statusCode: 402 } as never,
			{ functionality: 'configuration-node' },
		);

		expect(reWrapped.message).toBe(CANNED_402);
		expect(reWrapped.description).toContain('error_class=budget_exceeded');
	});
});

describe('TokenSenseChatModel supplyData wiring', () => {
	it('passes an onFailedAttempt handler to supplyModel', async () => {
		jest.resetModules();
		const captured: { options?: Record<string, unknown> } = {};
		jest.doMock('@n8n/ai-node-sdk', () => ({
			supplyModel: (_ctx: unknown, options: Record<string, unknown>) => {
				captured.options = options;
				return { response: {} };
			},
		}));

		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const { TokenSenseChatModel } = require('../nodes/TokenSenseChatModel/TokenSenseChatModel.node');
		const chatModel = new TokenSenseChatModel();
		const ctx = {
			getCredentials: async () => ({
				endpoint: 'https://api.tokensense.io',
				apiKey: 'test-secret-key',
			}),
			getNodeParameter: (name: string) => {
				const params: Record<string, unknown> = {
					model: 'gpt-4.1-mini',
					temperature: 0.7,
					maxTokens: 0,
					streaming: true,
					project: '',
					workflowTag: '',
					providerOverride: 'auto',
				};
				return params[name] ?? '';
			},
			getWorkflow: () => ({ name: 'Test Workflow', id: '123', active: true }),
			getNode: () => NODE,
			getExecutionId: () => 'exec-test-12345',
		};

		await chatModel.supplyData.call(ctx, 0);

		expect(typeof captured.options?.onFailedAttempt).toBe('function');

		const onFailedAttempt = captured.options!.onFailedAttempt as (error: unknown) => void;
		expect(() =>
			onFailedAttempt({ ...openAiApiError(402, ENVELOPE_402), retriesLeft: 0 }),
		).toThrow(ENVELOPE_402.message);

		jest.dontMock('@n8n/ai-node-sdk');
		jest.resetModules();
	});
});
