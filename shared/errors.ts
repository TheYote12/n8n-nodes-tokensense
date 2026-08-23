import type { INode, JsonObject } from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

/**
 * The structured error envelope TokenSense returns on every non-2xx response.
 *
 * Wire shape is `{ "error": { ... } }`; this interface describes the inner object.
 * Every field is optional because older TokenSense deployments (and non-TokenSense
 * proxies sitting in front of it) return partial envelopes.
 */
export interface TokenSenseErrorEnvelope {
	code?: string;
	error_class?: string;
	message?: string;
	type?: string;
	retryable?: boolean;
	retry_after_seconds?: number | null;
	scope?: string;
	budget_usd?: number | null;
	spent_usd?: number | null;
}

/** Structured error payload emitted on the continue-on-fail branch. */
export interface TokenSenseErrorOutput {
	message: string;
	code: string | null;
	error_class: string | null;
	retryable: boolean | null;
	retry_after_seconds: number | null;
	http_status: number | null;
	scope: string | null;
	budget_usd?: number | null;
	spent_usd?: number | null;
}

/**
 * Keys that only ever appear on a TokenSense (or OpenAI-shaped) error envelope.
 *
 * Used to tell a real envelope apart from an arbitrary nested object that merely
 * happens to sit at one of the candidate paths.
 */
const ENVELOPE_MARKER_KEYS = [
	'error_class',
	'code',
	'retryable',
	'retry_after_seconds',
	'scope',
	'budget_usd',
	'spent_usd',
] as const;

/** How far to follow `error.cause` when unwrapping nested/wrapped errors. */
const MAX_CAUSE_DEPTH = 3;

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function looksLikeEnvelope(value: unknown): value is Record<string, unknown> {
	if (!isPlainObject(value)) return false;
	return ENVELOPE_MARKER_KEYS.some((key) => value[key] !== undefined);
}

function asOptionalString(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

function asOptionalNumber(value: unknown): number | undefined {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim() !== '') {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return undefined;
}

function asOptionalBoolean(value: unknown): boolean | undefined {
	if (typeof value === 'boolean') return value;
	if (value === 'true') return true;
	if (value === 'false') return false;
	return undefined;
}

/**
 * Pull the TokenSense error envelope out of a failed request.
 *
 * The path the body ends up on depends on the n8n version and the transport:
 *  - `error.response.body.error`  — n8n `httpRequest` helper with `returnFullResponse`
 *  - `error.response.data.error`  — raw axios error
 *  - `error.error`                — request-promise style errors, and the `openai`
 *                                   SDK's `APIError`, which assigns the body's
 *                                   `error` property straight onto `.error`
 *  - `error.context.data`         — an already-wrapped NodeApiError (axios shape only)
 * Each candidate container is probed both as `container.error` and as the
 * container itself, because some layers unwrap the outer `{ error: ... }` for us
 * and others do not.
 *
 * Returns `undefined` when nothing envelope-shaped is found, so callers can fall
 * back to whatever the raw error offered.
 */
export function extractTokenSenseErrorEnvelope(
	error: unknown,
	depth = 0,
): TokenSenseErrorEnvelope | undefined {
	if (!isPlainObject(error) || depth > MAX_CAUSE_DEPTH) return undefined;

	const response = isPlainObject(error.response) ? error.response : undefined;
	const context = isPlainObject(error.context) ? error.context : undefined;
	const containers: unknown[] = [
		response?.body,
		response?.data,
		error.body,
		error.data,
		error.error,
		response,
		// Set by NodeApiError itself when it was handed an axios-shaped error, and
		// the only trace of the body left once n8n has wrapped it.
		context?.data,
		// Set by NodeError when the wrapped value was a plain object, not an Error.
		error.errorResponse,
	];

	for (const container of containers) {
		if (!isPlainObject(container)) continue;
		for (const candidate of [container.error, container]) {
			if (!looksLikeEnvelope(candidate)) continue;
			return {
				code: asOptionalString(candidate.code),
				error_class: asOptionalString(candidate.error_class),
				message: asOptionalString(candidate.message),
				type: asOptionalString(candidate.type),
				retryable: asOptionalBoolean(candidate.retryable),
				retry_after_seconds: asOptionalNumber(candidate.retry_after_seconds) ?? null,
				scope: asOptionalString(candidate.scope),
				budget_usd: asOptionalNumber(candidate.budget_usd) ?? null,
				spent_usd: asOptionalNumber(candidate.spent_usd) ?? null,
			};
		}
	}

	// NodeError stashes the original error on `cause`, and the openai SDK does the
	// same for connection errors, so follow the wrapper chain before giving up.
	return extractTokenSenseErrorEnvelope(error.cause, depth + 1);
}

/**
 * Best-effort HTTP status for a failed request, across the same set of transports.
 */
export function extractHttpStatus(error: unknown, depth = 0): number | undefined {
	if (!isPlainObject(error) || depth > MAX_CAUSE_DEPTH) return undefined;
	const response = isPlainObject(error.response) ? error.response : undefined;
	const candidates = [
		response?.statusCode,
		response?.status,
		error.statusCode,
		error.status,
		error.httpCode,
	];
	for (const candidate of candidates) {
		const status = asOptionalNumber(candidate);
		if (status !== undefined) return status;
	}
	return extractHttpStatus(error.cause, depth + 1);
}

/**
 * One-line, human-readable summary of the envelope, used as the NodeApiError
 * description. n8n persists the description verbatim, so this is what makes
 * `error_class` visible in an execution log.
 */
export function buildErrorDescription(envelope?: TokenSenseErrorEnvelope): string | undefined {
	if (!envelope?.error_class) return undefined;
	return `error_class=${envelope.error_class} · retryable=${envelope.retryable} · retry_after_seconds=${envelope.retry_after_seconds}`;
}

/**
 * Structured payload for the continue-on-fail branch.
 *
 * Every core field is always present (null when unknown) so a workflow can safely
 * branch on `$json.error.error_class` without first testing for existence.
 */
export function buildErrorOutput(
	error: unknown,
	envelope?: TokenSenseErrorEnvelope,
): TokenSenseErrorOutput {
	const status = extractHttpStatus(error);
	const output: TokenSenseErrorOutput = {
		message: envelope?.message ?? (error as Error)?.message ?? 'Unknown error',
		code: envelope?.code ?? null,
		error_class: envelope?.error_class ?? null,
		retryable: envelope?.retryable ?? null,
		retry_after_seconds: envelope?.retry_after_seconds ?? null,
		http_status: status ?? null,
		scope: envelope?.scope ?? null,
	};
	// Budget errors are the reason this envelope exists — carry the numbers when present.
	if (envelope?.budget_usd !== undefined && envelope.budget_usd !== null) {
		output.budget_usd = envelope.budget_usd;
	}
	if (envelope?.spent_usd !== undefined && envelope.spent_usd !== null) {
		output.spent_usd = envelope.spent_usd;
	}
	return output;
}

/**
 * Build a NodeApiError that keeps the TokenSense envelope intact.
 *
 * Without the `message`/`description`/`httpCode` overrides, NodeApiError replaces
 * the body's message with a canned per-status string from its own STATUS_CODE_MESSAGES
 * map — '402' becomes "Payment required - perhaps check your payment details?" and
 * '503' becomes "Service unavailable - try again later ...". Both are indistinguishable
 * from an infrastructure failure, which is exactly the signal we need to keep.
 *
 * If `error` is already a NodeApiError (some n8n transports wrap before we see it)
 * the constructor returns it verbatim and silently drops the overrides, so we apply
 * them by hand in that case.
 */
export function buildTokenSenseApiError(
	node: INode,
	error: unknown,
	options: { itemIndex?: number; functionality?: 'configuration-node' } = {},
): NodeApiError {
	const envelope = extractTokenSenseErrorEnvelope(error);
	const status = extractHttpStatus(error);
	const message = envelope?.message ?? (error as Error)?.message;
	const description = buildErrorDescription(envelope);

	const apiError = new NodeApiError(node, error as JsonObject, {
		...(options.itemIndex !== undefined ? { itemIndex: options.itemIndex } : {}),
		...(options.functionality ? { functionality: options.functionality } : {}),
		...(status !== undefined ? { httpCode: String(status) } : {}),
		...(message ? { message } : {}),
		...(description ? { description } : {}),
	});

	// NodeApiError does not reliably honour these overrides, so re-assert them:
	//  - given an existing NodeApiError it returns that instance verbatim and drops
	//    the options entirely (some n8n transports wrap before we see the error);
	//  - it overwrites a caller-supplied `description` with `response.data.error.message`
	//    and then clears it again as redundant when it equals the message, which is
	//    exactly the case for an axios-shaped TokenSense failure.
	if (message) apiError.message = message;
	if (description) apiError.description = description;
	if (status !== undefined) apiError.httpCode = String(status);

	return apiError;
}

/**
 * Statuses n8n's own `n8nDefaultFailedAttemptHandler` refuses to retry. Mirrored
 * here so the chat-model handler can tell a terminal attempt from a retryable one
 * without changing when the SDK gives up.
 */
const STATUS_NO_RETRY = [400, 401, 402, 403, 404, 405, 406, 407, 409];

/**
 * Whether this failed attempt is the last one — i.e. whether the error is about to
 * surface to the user rather than trigger another retry.
 */
export function isTerminalAttempt(error: unknown): boolean {
	const status = extractHttpStatus(error);
	if (status !== undefined && STATUS_NO_RETRY.includes(status)) return true;
	const retriesLeft = isPlainObject(error) ? error.retriesLeft : undefined;
	// Matches the SDK's own `error?.retriesLeft > 0` check: a missing count is terminal.
	return typeof retriesLeft === 'number' ? retriesLeft <= 0 : true;
}

/**
 * `onFailedAttempt` hook for the chat-model (LangChain) path.
 *
 * The chat model is supplied via `supplyModel` from `@n8n/ai-node-sdk`, so its
 * errors never reach the `execute()` catch block. They go through
 * `makeN8nLlmFailedAttemptHandler`, which builds a NodeApiError with no overrides —
 * the same canned-message problem, on a path we do not otherwise control.
 *
 * The one seam the SDK gives us is this hook, which it invokes before its own
 * handling. If we throw from here the SDK catches it and calls
 * `new NodeApiError(node, ourError, ...)`; because NodeApiError's constructor
 * returns the argument verbatim when it is already a NodeApiError, our enriched
 * instance is what gets thrown. We only do that on a terminal attempt, so retry
 * behaviour for genuinely retryable failures (503 among them) is unchanged.
 *
 * KNOWN GAP: this preserves `message` and `description` (which carries
 * `error_class`, `retryable` and `retry_after_seconds`) but not machine-readable
 * JSON. The `ai_languageModel` connection has no data output, so there is no
 * chat-model equivalent of the continue-on-fail structured payload — a workflow
 * cannot branch on `$json.error.error_class` for this node, only read the string.
 * Should the SDK ever resolve a different `n8n-workflow` copy than this package,
 * the `instanceof` short-circuit would stop applying and the canned message would
 * come back; `description` would still survive, because NodeApiError copies
 * `errorResponse.description` when no override is given.
 */
export function makeTokenSenseFailedAttemptHandler(
	getNode: () => INode,
): (error: unknown) => void {
	return (error: unknown) => {
		const envelope = extractTokenSenseErrorEnvelope(error);
		// Nothing TokenSense-specific to preserve — leave the SDK's behaviour alone.
		if (!envelope?.error_class) return;
		if (!isTerminalAttempt(error)) return;
		throw buildTokenSenseApiError(getNode(), error, { functionality: 'configuration-node' });
	};
}
