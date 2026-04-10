import type {
	ILoadOptionsFunctions,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	ISupplyDataFunctions,
	SupplyData,
} from 'n8n-workflow';
import { OpenAIEmbeddings } from '@langchain/openai';

export class TokenSenseEmbeddings implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'TokenSense Embeddings',
		name: 'tokenSenseEmbeddings',
		icon: 'file:../../icons/tokensense.svg',
		group: ['transform'],
		version: 1,
		description: 'Use TokenSense for text embeddings in RAG pipelines',
		defaults: { name: 'TokenSense Embeddings' },
		codex: {
			categories: ['AI'],
			subcategories: { AI: ['Embeddings'] },
			resources: {
				primaryDocumentation: [{ url: 'https://github.com/TheYote12/n8n-nodes-tokensense' }],
			},
		},
		inputs: [],
		outputs: ['ai_embedding'],
		credentials: [{ name: 'tokenSenseApi', required: true }],
		properties: [
			{
				displayName: 'Model',
				name: 'model',
				type: 'options',
				default: 'text-embedding-3-small',
				required: true,
				typeOptions: { loadOptionsMethod: 'getEmbeddingModels' },
			},
			{
				displayName: 'Dimensions',
				name: 'dimensions',
				type: 'number',
				default: 0,
				description: 'Output dimensions (only for text-embedding-3-* models). Leave at 0 for model default.',
			},
			{
				displayName: 'Project',
				name: 'project',
				type: 'string',
				default: '',
				description: 'TokenSense project name for cost tracking and analytics',
			},
			{
				displayName: 'Workflow Tag',
				name: 'workflowTag',
				type: 'string',
				default: '',
				description: 'Tag to identify this workflow in TokenSense Dashboard. Auto-detected from workflow name if left empty.',
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
					{ name: 'Google', value: 'google' },
				],
			},
		],
	};

	methods = {
		loadOptions: {
			async getEmbeddingModels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				try {
					const credentials = await this.getCredentials('tokenSenseApi');
					const response = await this.helpers.httpRequest({
						method: 'GET',
						url: `${credentials.endpoint as string}/v1/models`,
						headers: { 'x-tokensense-key': credentials.apiKey as string },
					});
					const embeddingModels = (response.data as Array<{ id: string }>).filter(
						(m) => m.id.includes('embedding') || m.id.includes('embed'),
					);
					if (embeddingModels.length > 0) {
						return embeddingModels.map((m) => ({ name: m.id, value: m.id }));
					}
					throw new Error('No embedding models found');
				} catch {
					return [
						{ name: 'Text Embedding 3 Small', value: 'text-embedding-3-small' },
						{ name: 'Text Embedding 3 Large', value: 'text-embedding-3-large' },
						{ name: 'Text Embedding Ada 002', value: 'text-embedding-ada-002' },
					];
				}
			},
		},
	};

	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
		const credentials = await this.getCredentials('tokenSenseApi');
		const model = this.getNodeParameter('model', itemIndex) as string;
		const dimensions = this.getNodeParameter('dimensions', itemIndex) as number;
		const project = this.getNodeParameter('project', itemIndex, '') as string;
		const workflowTag = this.getNodeParameter('workflowTag', itemIndex, '') as string;
		const providerOverride = this.getNodeParameter('providerOverride', itemIndex, 'auto') as string;

		const effectiveTag = workflowTag || this.getWorkflow().name || '';

		const metadata: Record<string, string> = { source: 'n8n-nodes-tokensense' };
		if (effectiveTag) metadata.workflow_tag = effectiveTag;
		if (project) metadata.project = project;
		if (providerOverride && providerOverride !== 'auto') metadata.provider = providerOverride;

		const nativeFetch = globalThis.fetch;
		const metadataInjectingFetch: typeof globalThis.fetch = async (url, init) => {
			if (init?.body && typeof init.body === 'string') {
				try {
					const body = JSON.parse(init.body);
					body.metadata = metadata;
					init = { ...init, body: JSON.stringify(body) };
				} catch {
					// non-JSON body, pass through
				}
			}
			return nativeFetch(url, init);
		};

		const embeddings = new OpenAIEmbeddings({
			model,
			...(dimensions > 0 ? { dimensions } : {}),
			configuration: {
				baseURL: `${credentials.endpoint as string}/v1`,
				apiKey: credentials.apiKey as string,
				fetch: metadataInjectingFetch,
			},
		});

		return { response: embeddings };
	}
}

export default TokenSenseEmbeddings;
