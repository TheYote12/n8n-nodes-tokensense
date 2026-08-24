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

// ⚠ THESE FIXTURES ARE THE PROXY'S REAL WIRE FORMAT. Round 5 found the previous
// ones were fiction: they gave the 402 an `error_class`, which the proxy set
// ONLY on the 503 path. Every test passed while the real 402 path was broken —
// the ChatModel handler gated on `error_class` and dropped genuine 402s, and
// `buildErrorDescription` returned undefined for them. The paired PRs were
// never checked against each other.
//
// Keep these in step with `Proxy/errors.js` sendError + `Proxy/budgetReject.js`,
// which now sends `error_class` on BOTH statuses. Pinned on the proxy side by
// "the wire envelope both statuses must carry" in budget-endpoint.test.js.
//
// Deliberately ASYMMETRIC values: `code` differs from `error_class` and
// `budget_usd` differs from `spent_usd`, so transposing either pair fails a
// test. The old fixtures had them equal, so a swap was invisible — the same
// defect the proxy suite had.
const ENVELOPE_402 = {
	code: 'PROJECT_BUDGET_EXCEEDED',
	error_class: 'budget_exceeded',
	message: 'Monthly project budget exceeded.',
	type: 'billing_error',
	retryable: false,
	scope: 'project',
	project_id: 'proj-scene3d',
	budget_usd: 47.3,
	spent_usd: 50.12,
};

// An older proxy deployment: no `error_class`. The node must still surface it —
// it cannot enforce which fields the server sends.
const ENVELOPE_402_LEGACY = {
	code: 'PROJECT_BUDGET_EXCEEDED',
	message: 'Monthly project budget exceeded.',
	type: 'billing_error',
	budget_usd: 47.3,
	spent_usd: 50.12,
};

const ENVELOPE_503 = {
	code: 'BUDGET_CHECK_UNAVAILABLE',
	error_class: 'budget_check_unavailable',
	// Round 6: this said 'infrastructure_error' and a message the proxy has never
	// sent. `type` was the one field the round-5 contract test asserted for the
	// 402 and silently omitted for the 503 — so the wrong field was exactly the
	// unasserted one, which is the same shape as the invented `error_class` that
	// round 5 was written to eliminate.
	message: 'Budget verification is temporarily unavailable. This is not a billing decision — retry shortly.',
	type: 'service_unavailable',
	retryable: true,
	retry_after_seconds: 30,
	scope: 'project',
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
		expect(envelope?.scope).toBe('project');
	});

	it('reads the envelope from error.response.data.error (axios)', () => {
		const envelope = extractTokenSenseErrorEnvelope(axiosError(503, ENVELOPE_503));
		expect(envelope?.error_class).toBe('budget_check_unavailable');
		expect(envelope?.retry_after_seconds).toBe(30);
	});

	it('reads the envelope from error.error (openai SDK / request-promise)', () => {
		const envelope = extractTokenSenseErrorEnvelope(openAiApiError(402, ENVELOPE_402));
		expect(envelope?.error_class).toBe('budget_exceeded');
		expect(envelope?.budget_usd).toBe(47.3);
		expect(envelope?.spent_usd).toBe(50.12);
		expect(envelope?.code).toBe('PROJECT_BUDGET_EXCEEDED');
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
			'error_class=budget_check_unavailable · retryable=true · retry_after_seconds=30 · scope=project',
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
			'error_class=budget_check_unavailable · retryable=true · retry_after_seconds=30 · scope=project',
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
			code: 'PROJECT_BUDGET_EXCEEDED',
			error_class: 'budget_exceeded',
			retryable: false,
			retry_after_seconds: null,
			http_status: 402,
			scope: 'project',
			project_id: 'proj-scene3d',
			budget_usd: 47.3,
			spent_usd: 50.12,
		});
	});

	it('produces branchable fields for a 503', () => {
		const error = axiosError(503, ENVELOPE_503);
		expect(buildErrorOutput(error, extractTokenSenseErrorEnvelope(error))).toEqual({
			message: ENVELOPE_503.message,
			code: 'BUDGET_CHECK_UNAVAILABLE',
			error_class: 'budget_check_unavailable',
			retryable: true,
			retry_after_seconds: 30,
			http_status: 503,
			scope: 'project',
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
		expect(thrown.description).not.toContain('undefined');
		expect(thrown.description).toContain('budget_usd=47.3');
		expect(thrown.description).toContain('spent_usd=50.12');
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
		expect(error.scope).toBe('project');
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
		expect(thrown.description).not.toContain('undefined');
		expect(thrown.description).toContain('budget_usd=47.3');
		expect(thrown.description).toContain('spent_usd=50.12');
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

// ─────────────────────────────────────────────────────────────────────────────
// Round 5. The node's first adversarial review. Everything here was uncovered.
// ─────────────────────────────────────────────────────────────────────────────

describe('an envelope without error_class is still surfaced', () => {
	// The proxy set `error_class` only on the 503 path until round 5, so this is
	// what a real 402 looked like — and what an older deployment still sends.
	// The node must not depend on a field it cannot make the server emit.

	it('the ChatModel handler enriches a 402 that carries no error_class', () => {
		const err = { ...openAiApiError(402, ENVELOPE_402_LEGACY), retriesLeft: 0 };
		let thrown: any;
		try {
			makeTokenSenseFailedAttemptHandler(() => NODE)(err);
		} catch (e) { thrown = e; }

		// Before round 5 this returned silently and the customer saw
		// "Payment required - perhaps check your payment details?" — the
		// incident's own symptom, for a real budget error.
		expect(thrown).toBeDefined();
		expect(thrown.message).toBe(ENVELOPE_402_LEGACY.message);
		expect(thrown.message).not.toBe(CANNED_402);
	});

	it('the description carries the budget numbers even with no error_class', () => {
		const envelope = extractTokenSenseErrorEnvelope(axiosError(402, ENVELOPE_402_LEGACY));
		const description = buildErrorDescription(envelope);

		expect(description).toContain('code=PROJECT_BUDGET_EXCEEDED');
		expect(description).toContain('budget_usd=47.3');
		expect(description).toContain('spent_usd=50.12');
	});

	it('never renders a literal "undefined" into customer-visible text', () => {
		// `retryable` is optional, and unconditional interpolation produced
		// `retryable=undefined` — which reads as "not retryable" for an error
		// that may well be.
		const description = buildErrorDescription(
			extractTokenSenseErrorEnvelope(axiosError(402, ENVELOPE_402_LEGACY)),
		);
		expect(description).not.toContain('undefined');
	});

	it('a transport error with a code but no HTTP status is left to the SDK', () => {
		// ECONNREFUSED carries a `code`, so gating on "we found an envelope"
		// alone would capture it. An HTTP status is what separates our
		// structured error from the network breaking.
		const err = Object.assign(new Error('connect ECONNREFUSED'), {
			code: 'ECONNREFUSED', retriesLeft: 0,
		});
		expect(() => makeTokenSenseFailedAttemptHandler(() => NODE)({ error: err })).not.toThrow();
	});
});

describe('the wire contract shared with the proxy', () => {
	it('the 402 fixture matches what Proxy/budgetReject.js actually sends', () => {
		// Pinned to LITERALS, not to a constant either side reads — the previous
		// fixture invented an `error_class` the proxy never sent and nothing
		// noticed. The proxy half is pinned by "the wire envelope both statuses
		// must carry" in Proxy/budget-endpoint.test.js.
		expect(ENVELOPE_402.code).toBe('PROJECT_BUDGET_EXCEEDED');
		expect(ENVELOPE_402.error_class).toBe('budget_exceeded');
		expect(ENVELOPE_402.type).toBe('billing_error');
		expect(ENVELOPE_402.retryable).toBe(false);
		expect(ENVELOPE_402.scope).toBe('project');
	});

	it('the 503 fixture matches what Proxy/budgetReject.js actually sends', () => {
		expect(ENVELOPE_503.code).toBe('BUDGET_CHECK_UNAVAILABLE');
		expect(ENVELOPE_503.error_class).toBe('budget_check_unavailable');
		expect(ENVELOPE_503.retryable).toBe(true);
		expect(ENVELOPE_503.scope).toBe('project');
		// Round 6: `type` was asserted for the 402 and omitted here, and the
		// omitted field was the wrong one. Assert BOTH halves symmetrically.
		expect(ENVELOPE_503.type).toBe('service_unavailable');
		expect(ENVELOPE_503.message).toBe(
			'Budget verification is temporarily unavailable. This is not a billing decision — retry shortly.',
		);
	});

	it('code and error_class are distinct, so transposing them is visible', () => {
		expect(ENVELOPE_402.code).not.toBe(ENVELOPE_402.error_class);
		expect(ENVELOPE_503.code).not.toBe(ENVELOPE_503.error_class);
	});

	it('budget_usd and spent_usd are distinct, so transposing them is visible', () => {
		expect(ENVELOPE_402.budget_usd).not.toBe(ENVELOPE_402.spent_usd);
		expect(ENVELOPE_402.spent_usd).toBeGreaterThan(ENVELOPE_402.budget_usd);
	});
});

describe('error.cause recursion', () => {
	// Both extractors recurse through `cause`; neither recursion had any test.
	// Replacing both with `return undefined` left the suite green.

	it('follows error.cause to find a wrapped envelope', () => {
		const inner = axiosError(402, ENVELOPE_402);
		const outer = Object.assign(new Error('Connection error.'), { cause: inner });

		expect(extractTokenSenseErrorEnvelope(outer)?.error_class).toBe('budget_exceeded');
		expect(extractHttpStatus(outer)).toBe(402);
	});

	it('stops following cause past the depth cap rather than recursing forever', () => {
		let e: unknown = axiosError(402, ENVELOPE_402);
		for (let n = 0; n < 6; n++) e = Object.assign(new Error('wrap'), { cause: e });

		expect(extractTokenSenseErrorEnvelope(e)).toBeUndefined();
	});
});

describe('a degenerate envelope message never wins over n8n\'s canned text', () => {
	it.each([
		['empty string', ''],
		['whitespace only', '   '],
		['a tab and newline', '\t\n'],
	])('%s falls back to the canned message', (_label, message) => {
		const apiError = buildTokenSenseApiError(
			NODE,
			axiosError(402, { ...ENVELOPE_402, message }),
			{ itemIndex: 0 },
		);
		// A blank error title is worse than the canned string it replaced.
		expect(apiError.message).toBe(CANNED_402);
	});

	it.each([
		['empty string', ''],
		['whitespace only', '   '],
	])('%s does not blank the continue-on-fail payload either', (_label, message) => {
		const raw = axiosError(402, { ...ENVELOPE_402, message });
		const output = buildErrorOutput(raw, extractTokenSenseErrorEnvelope(raw));

		// `??` only guards nullish, so an empty string used to win here while the
		// throw path correctly fell back — the same error, two different answers.
		expect(output.message).toBeTruthy();
		expect(output.message.trim()).not.toBe('');
	});
});

describe('round 6: the classification names WHICH project, and survives a streamed error', () => {
	it('project_id reaches the description and the continue-on-fail payload', () => {
		// A workspace with several projects was told "a project budget was
		// exceeded" and not which one. On the ChatModel path the description is
		// the only channel, so that was unrecoverable.
		const raw = axiosError(402, ENVELOPE_402);
		const envelope = extractTokenSenseErrorEnvelope(raw);

		expect(envelope?.project_id).toBe('proj-scene3d');
		expect(buildErrorDescription(envelope)).toContain('project_id=proj-scene3d');

		// Round 7: this test NAMED the continue-on-fail payload and never checked
		// it — and production did not implement it, with the `toEqual` above
		// pinning the omission. The description is the human channel; `$json` is
		// the one the "so a workflow can branch on it" rationale is about.
		expect(buildErrorOutput(raw, envelope).project_id).toBe('proj-scene3d');
	});

	it('workflow_tag reaches the description on a workflow-cap block', () => {
		const raw = axiosError(402, {
			code: 'WORKFLOW_BUDGET_EXCEEDED',
			error_class: 'budget_exceeded',
			message: 'Monthly workflow budget exceeded.',
			type: 'billing_error',
			retryable: false,
			scope: 'workflow',
			workflow_tag: 'Scene3D D5d Reconciler',
			budget_usd: 10,
			spent_usd: 12,
		});

		expect(buildErrorDescription(extractTokenSenseErrorEnvelope(raw)))
			.toContain('workflow_tag=Scene3D D5d Reconciler');
	});

	it('an envelope delivered with NO http status is still enriched', () => {
		// The openai SDK throws `new APIError(undefined, data.error, …)` for an
		// error inside an SSE body — `status` is hardcoded undefined and there is
		// no `.response`. Streaming is this node's default, so requiring a status
		// was one-sided in the same way the old `error_class` gate was.
		const err = { name: 'APIError', status: undefined, error: ENVELOPE_402, retriesLeft: 0 };
		let thrown: any;
		try {
			makeTokenSenseFailedAttemptHandler(() => NODE)(err);
		} catch (e) { thrown = e; }

		expect(thrown).toBeDefined();
		expect(thrown.description).toContain('error_class=budget_exceeded');
	});

	it('a transport error with a code but neither a status nor our shape is still skipped', () => {
		// The gate must stay closed to things that are not ours.
		const err = Object.assign(new Error('connect ECONNREFUSED'), {
			code: 'ECONNREFUSED', retriesLeft: 0,
		});
		expect(() => makeTokenSenseFailedAttemptHandler(() => NODE)({ error: err })).not.toThrow();
	});

	it('both paths emit the same message for a whitespace-padded one', () => {
		// The two paths trimmed differently: buildErrorOutput used the trimmed
		// string as the VALUE while the throw path emitted it untrimmed, so the
		// same envelope produced two different messages depending on a toggle.
		const padded = `  ${ENVELOPE_402.message}  `;
		const raw = axiosError(402, { ...ENVELOPE_402, message: padded });

		const thrown = buildTokenSenseApiError(NODE, raw, { itemIndex: 0 });
		const output = buildErrorOutput(raw, extractTokenSenseErrorEnvelope(raw));

		expect(output.message).toBe(thrown.message);
	});
});

describe('round 7: each half of the disjunctive gate is independently load-bearing', () => {
	// The round-6 gate is `hasStatus || error_class || type`. Its only no-status
	// test used ENVELOPE_402, which carries BOTH error_class and type — so
	// deleting either disjunct left the suite green. The `type` half is the one
	// that matters: the proxy sets `error_class` only from budgetReject, so every
	// NON-budget code (INVALID_API_KEY, RATE_LIMITED, MODEL_NOT_FOUND,
	// MISSING_PROVIDER_KEY, PROVIDER_ERROR, POLICY_BLOCKED) carries `type` and
	// nothing else. Delivered in an SSE body they have no status either, and
	// streaming is this node's default path.

	it('a no-status envelope with type but NO error_class is still enriched', () => {
		const err = {
			name: 'APIError', status: undefined, retriesLeft: 0,
			error: { code: 'INVALID_REQUEST', message: 'model is required', type: 'invalid_request_error' },
		};
		let thrown: any;
		try { makeTokenSenseFailedAttemptHandler(() => NODE)(err); } catch (e) { thrown = e; }

		expect(thrown).toBeDefined();
		expect(thrown.message).toBe('model is required');
	});

	it('a no-status envelope with error_class but NO type is still enriched', () => {
		const { type, ...noType } = ENVELOPE_402;
		const err = { name: 'APIError', status: undefined, error: noType, retriesLeft: 0 };
		let thrown: any;
		try { makeTokenSenseFailedAttemptHandler(() => NODE)(err); } catch (e) { thrown = e; }

		expect(thrown).toBeDefined();
		expect(thrown.message).toBe(ENVELOPE_402.message);
	});
});

describe('round 7: a customer-controlled tag cannot break or bloat the description', () => {
	it('collapses newlines so the one-line contract holds', () => {
		const raw = axiosError(402, { ...ENVELOPE_402, workflow_tag: 'Line one\nLine two' });
		const description = buildErrorDescription(extractTokenSenseErrorEnvelope(raw));

		expect(description).not.toContain('\n');
		expect(description).toContain('workflow_tag=Line one Line two');
	});

	it('truncates an unbounded tag rather than logging it verbatim', () => {
		// The proxy's 64-char cap applies only to the AUTO-generated tag; a
		// customer-supplied x-workflow-tag header is unbounded and would be
		// persisted into every n8n execution log.
		const raw = axiosError(402, { ...ENVELOPE_402, workflow_tag: 'x'.repeat(5000) });
		const description = buildErrorDescription(extractTokenSenseErrorEnvelope(raw));

		expect(description!.length).toBeLessThan(400);
		expect(description).toContain('…');
	});
});
