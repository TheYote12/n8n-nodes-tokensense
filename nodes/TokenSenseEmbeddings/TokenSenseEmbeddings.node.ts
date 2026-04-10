import type {
	ILoadOptionsFunctions,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	ISupplyDataFunctions,
	SupplyData,
} from 'n8n-workflow';
import { OpenAIEmbeddings } from '@langchain/openai';
import { buildMetadata, loadModels } from '../../shared/utils';

const EMBEDDING_FALLBACK: INodePropertyOptions[] = [
	{ name: 'Text Embedding 3 Small', value: 'text-embedding-3-small' },
	{ name: 'Text Embedding 3 Large', value: 'text-embedding-3-large' },
	{ name: 'Text Embedding Ada 002', value: 'text-embedding-ada-002' },
];

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
				return loadModels.call(
					this,
					(id) => id.includes('embedding') || id.includes('embed'),
					EMBEDDING_FALLBACK,
				);
			},
		},
	};

	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
		const credentials = await this.getCredentials('tokenSenseApi');
		const model = this.getNodeParameter('model', itemIndex) as string;
		const dimensions = this.getNodeParameter('dimensions', itemIndex) as number;

		const metadata = buildMetadata(this, itemIndex, { includeProvider: true });

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
