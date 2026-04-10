import type {
	ILoadOptionsFunctions,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	ISupplyDataFunctions,
	SupplyData,
} from 'n8n-workflow';
import { ChatOpenAI } from '@langchain/openai';

export class TokenSenseChatModel implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'TokenSense Chat Model',
		name: 'tokenSenseChatModel',
		icon: 'file:../../icons/tokensense.svg',
		group: ['transform'],
		version: 1,
		description: 'Use TokenSense as a Chat Model in AI Agent workflows',
		defaults: { name: 'TokenSense Chat Model' },
		codex: {
			categories: ['AI'],
			subcategories: { AI: ['Language Models', 'Chat Models'] },
			resources: {
				primaryDocumentation: [{ url: 'https://github.com/TheYote12/n8n-nodes-tokensense' }],
			},
		},
		inputs: [],
		outputs: ['ai_languageModel'],
		credentials: [{ name: 'tokenSenseApi', required: true }],
		properties: [
			{
				displayName: 'Model',
				name: 'model',
				type: 'options',
				default: 'gpt-4o',
				required: true,
				typeOptions: { loadOptionsMethod: 'getModels' },
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
				displayName: 'Streaming',
				name: 'streaming',
				type: 'boolean',
				default: true,
				description: 'Whether to stream the response from the model',
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
					{ name: 'Anthropic', value: 'anthropic' },
					{ name: 'Google', value: 'google' },
					{ name: 'xAI', value: 'xai' },
					{ name: 'Mistral', value: 'mistral' },
				],
			},
		],
	};

	methods = {
		loadOptions: {
			async getModels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				try {
					const credentials = await this.getCredentials('tokenSenseApi');
					const response = await this.helpers.httpRequest({
						method: 'GET',
						url: `${credentials.endpoint as string}/v1/models`,
						headers: { 'x-tokensense-key': credentials.apiKey as string },
					});
					return (response.data as Array<{ id: string }>).map((m) => ({
						name: m.id,
						value: m.id,
					}));
				} catch {
					return [
						{ name: 'GPT-4o', value: 'gpt-4o' },
						{ name: 'GPT-4o Mini', value: 'gpt-4o-mini' },
						{ name: 'Claude Sonnet 4.5', value: 'claude-sonnet-4-5-20250929' },
						{ name: 'Claude Haiku 3.5', value: 'claude-haiku-3-5-20241022' },
						{ name: 'Gemini 2.0 Flash', value: 'gemini-2.0-flash' },
						{ name: 'GPT-5.4', value: 'gpt-5.4' },
					];
				}
			},
		},
	};

	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
		const credentials = await this.getCredentials('tokenSenseApi');
		const model = this.getNodeParameter('model', itemIndex) as string;
		const temperature = this.getNodeParameter('temperature', itemIndex) as number;
		const maxTokens = this.getNodeParameter('maxTokens', itemIndex) as number;
		const streaming = this.getNodeParameter('streaming', itemIndex, true) as boolean;
		const project = this.getNodeParameter('project', itemIndex, '') as string;
		const workflowTag = this.getNodeParameter('workflowTag', itemIndex, '') as string;
		const providerOverride = this.getNodeParameter('providerOverride', itemIndex, 'auto') as string;

		const effectiveTag = workflowTag || this.getWorkflow().name || '';

		const metadata: Record<string, string> = { source: 'n8n-nodes-tokensense' };
		if (effectiveTag) metadata.workflow_tag = effectiveTag;
		if (project) metadata.project = project;
		if (providerOverride && providerOverride !== 'auto') metadata.provider = providerOverride;

		const chatModel = new ChatOpenAI({
			model,
			temperature,
			streaming,
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

export default TokenSenseChatModel;
