import type {
	INodeType,
	INodeTypeDescription,
	ISupplyDataFunctions,
	SupplyData,
} from 'n8n-workflow';
import { OpenAIEmbeddings } from '@langchain/openai';

export class AegisEmbeddings implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Aegis Embeddings',
		name: 'aegisEmbeddings',
		icon: 'file:../../icons/aegis.svg',
		group: ['transform'],
		version: 1,
		description: 'Use Aegis AI for text embeddings in RAG pipelines',
		defaults: { name: 'Aegis Embeddings' },
		codex: {
			categories: ['AI'],
			subcategories: { AI: ['Embeddings'] },
		},
		inputs: [],
		outputs: ['ai_embedding'],
		credentials: [{ name: 'aegisApi', required: true }],
		properties: [
			{
				displayName: 'Model',
				name: 'model',
				type: 'options',
				default: 'text-embedding-3-small',
				required: true,
				options: [
					{ name: 'Text Embedding 3 Small', value: 'text-embedding-3-small' },
					{ name: 'Text Embedding 3 Large', value: 'text-embedding-3-large' },
					{ name: 'Text Embedding Ada 002', value: 'text-embedding-ada-002' },
				],
			},
			{
				displayName: 'Dimensions',
				name: 'dimensions',
				type: 'number',
				default: 0,
				description: 'Output dimensions (only for text-embedding-3-* models). Leave at 0 for model default.',
			},
		],
	};

	async supplyData(this: ISupplyDataFunctions): Promise<SupplyData> {
		const credentials = await this.getCredentials('aegisApi');
		const model = this.getNodeParameter('model', 0) as string;
		const dimensions = this.getNodeParameter('dimensions', 0) as number;

		const embeddings = new OpenAIEmbeddings({
			modelName: model,
			...(dimensions > 0 ? { dimensions } : {}),
			configuration: {
				baseURL: `${credentials.endpoint as string}/v1`,
				apiKey: credentials.apiKey as string,
			},
		});

		return { response: embeddings };
	}
}

export default AegisEmbeddings;
