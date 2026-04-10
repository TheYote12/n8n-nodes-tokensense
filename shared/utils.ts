import type {
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodePropertyOptions,
	ISupplyDataFunctions,
} from 'n8n-workflow';

type MetadataContext = IExecuteFunctions | ISupplyDataFunctions;

/**
 * Build the metadata Record sent with every TokenSense API call.
 *
 * - `source` is always set.
 * - `workflow_tag` comes from the manual field, falling back to the workflow name.
 * - `project` is included when non-empty.
 * - `provider` is only included when `options.includeProvider` is `true` — callers
 *   must opt in explicitly. Only pass `includeProvider: true` when the node actually
 *   exposes a `providerOverride` field; otherwise n8n may return a stale stored value
 *   from a previous execution that had the field visible.
 *
 * `project` and `workflowTag` must exist on every calling node; a missing
 * parameter there is a real bug, not something to swallow.
 */
export function buildMetadata(
	context: MetadataContext,
	itemIndex: number,
	options?: { includeProvider?: boolean },
): Record<string, string> {
	const workflowTag = context.getNodeParameter('workflowTag', itemIndex, '') as string;
	const effectiveTag = workflowTag || context.getWorkflow().name || '';
	const project = context.getNodeParameter('project', itemIndex, '') as string;

	const metadata: Record<string, string> = { source: 'n8n-nodes-tokensense' };
	if (effectiveTag) metadata.workflow_tag = effectiveTag;
	if (project) metadata.project = project;

	if (options?.includeProvider) {
		const providerOverride = context.getNodeParameter('providerOverride', itemIndex, 'auto') as string;
		if (providerOverride && providerOverride !== 'auto') metadata.provider = providerOverride;
	}

	return metadata;
}

const DEFAULT_MODELS: INodePropertyOptions[] = [
	{ name: 'GPT-4o', value: 'gpt-4o' },
	{ name: 'GPT-4o Mini', value: 'gpt-4o-mini' },
	{ name: 'Claude Sonnet 4.5', value: 'claude-sonnet-4-5-20250929' },
	{ name: 'Claude Haiku 3.5', value: 'claude-haiku-3-5-20241022' },
	{ name: 'Gemini 2.0 Flash', value: 'gemini-2.0-flash' },
	{ name: 'GPT-5.4', value: 'gpt-5.4' },
];

/**
 * Load models from the TokenSense /v1/models endpoint.
 *
 * @param filter  - Optional predicate applied to each model id (e.g. embedding filter).
 * @param fallback - Fallback list returned when the API call fails or the filter
 *                   yields no results. Defaults to the standard chat-model list.
 */
export async function loadModels(
	this: ILoadOptionsFunctions,
	filter?: (id: string) => boolean,
	fallback?: INodePropertyOptions[],
): Promise<INodePropertyOptions[]> {
	try {
		const credentials = await this.getCredentials('tokenSenseApi');
		const response = await this.helpers.httpRequest({
			method: 'GET',
			url: `${credentials.endpoint as string}/v1/models`,
			headers: { 'x-tokensense-key': credentials.apiKey as string },
		});
		let models = response.data as Array<{ id: string }>;
		if (filter) {
			const filtered = models.filter((m) => filter(m.id));
			if (filtered.length === 0) throw new Error('No models matched filter');
			models = filtered;
		}
		return models.map((m) => ({ name: m.id, value: m.id }));
	} catch {
		return fallback ?? DEFAULT_MODELS;
	}
}
