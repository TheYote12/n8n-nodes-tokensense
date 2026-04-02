import type {
	INodeType,
	INodeTypeDescription,
	ISupplyDataFunctions,
	SupplyData,
} from 'n8n-workflow';
import { ChatOpenAI } from '@langchain/openai';

export class AegisChatModel implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Aegis Chat Model',
		name: 'aegisChatModel',
		icon: 'file:../../icons/aegis.svg',
		group: ['transform'],
		version: 1,
		description: 'Use Aegis AI as a Chat Model in AI Agent workflows',
		defaults: { name: 'Aegis Chat Model' },
		codex: {
			categories: ['AI'],
			subcategories: { AI: ['Language Models', 'Chat Models'] },
		},
		inputs: [],
		outputs: ['ai_languageModel'],
		credentials: [{ name: 'aegisApi', required: true }],
		properties: [
			{
				displayName: 'Model',
				name: 'model',
				type: 'options',
				default: 'gpt-4o',
				required: true,
				options: [
					{ name: 'GPT-4o', value: 'gpt-4o' },
					{ name: 'GPT-4o Mini', value: 'gpt-4o-mini' },
					{ name: 'Claude Sonnet 4.5', value: 'claude-sonnet-4-5-20250929' },
					{ name: 'Claude Haiku 3.5', value: 'claude-haiku-3-5-20241022' },
					{ name: 'Gemini 2.0 Flash', value: 'gemini-2.0-flash' },
					{ name: 'GPT-5.4', value: 'gpt-5.4' },
				],
			},
			{
				displayName: 'Temperature',
				name: 'temperature',
				type: 'number',
				default: 0.7,
				typeOptions: { minValue: 0, maxValue: 2, numberPrecision: 1 },
				description: 'Controls randomness in the output (0 = deterministic, 2 = maximum randomness)',
			},
			{
				displayName: 'Max Tokens',
				name: 'maxTokens',
				type: 'number',
				default: 0,
				description: 'Maximum number of tokens to generate. Leave at 0 for model default.',
			},
			{
				displayName: 'Project',
				name: 'project',
				type: 'string',
				default: '',
				description: 'Aegis project name for cost tracking and analytics',
			},
			{
				displayName: 'Workflow Tag',
				name: 'workflowTag',
				type: 'string',
				default: '',
				description: 'Tag to identify this workflow in Aegis Dashboard',
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
					{ name: 'Anthropic', value: 'anthropic' },
					{ name: 'Google', value: 'google' },
					{ name: 'xAI', value: 'xai' },
					{ name: 'Mistral', value: 'mistral' },
				],
			},
		],
	};

	async supplyData(this: ISupplyDataFunctions): Promise<SupplyData> {
		const credentials = await this.getCredentials('aegisApi');
		const model = this.getNodeParameter('model', 0) as string;
		const temperature = this.getNodeParameter('temperature', 0) as number;
		const maxTokens = this.getNodeParameter('maxTokens', 0) as number;
		const project = this.getNodeParameter('project', 0, '') as string;
		const workflowTag = this.getNodeParameter('workflowTag', 0, '') as string;
		const providerOverride = this.getNodeParameter('providerOverride', 0, 'auto') as string;

		const metadata: Record<string, string> = { source: 'n8n-nodes-aegis' };
		if (workflowTag) metadata.workflow_tag = workflowTag;
		if (project) metadata.project = project;
		if (providerOverride && providerOverride !== 'auto') metadata.provider = providerOverride;

		const chatModel = new ChatOpenAI({
			modelName: model,
			temperature,
			...(maxTokens > 0 ? { maxTokens } : {}),
			configuration: {
				baseURL: `${credentials.endpoint as string}/v1`,
				apiKey: credentials.apiKey as string,
			},
			modelKwargs: { metadata },
		});

		return { response: chatModel };
	}
}

export default AegisChatModel;
