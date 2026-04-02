import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';

export class AegisAi implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Aegis AI',
		name: 'aegisAi',
		icon: 'file:../../icons/aegis.svg',
		group: ['transform'],
		version: 1,
		description: 'Call Aegis AI for chat completions, embeddings, image generation, and more',
		defaults: { name: 'Aegis AI' },
		codex: {
			categories: ['AI'],
			subcategories: { AI: ['Language Models'] },
		},
		inputs: ['main'],
		outputs: ['main'],
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
				displayName: 'System Prompt',
				name: 'systemPrompt',
				type: 'string',
				default: '',
				typeOptions: { rows: 4 },
				description: 'Optional system message to set the behavior of the model',
			},
			{
				displayName: 'User Message',
				name: 'userMessage',
				type: 'string',
				default: '',
				required: true,
				typeOptions: { rows: 4 },
				description: 'The message to send to the model',
			},
			{
				displayName: 'Temperature',
				name: 'temperature',
				type: 'number',
				default: 0.7,
				typeOptions: { minValue: 0, maxValue: 2, numberPrecision: 1 },
				description: 'Controls randomness in the output',
			},
			{
				displayName: 'Max Tokens',
				name: 'maxTokens',
				type: 'number',
				default: 0,
				description: 'Maximum number of tokens to generate. Leave at 0 for model default.',
			},
			{
				displayName: 'JSON Mode',
				name: 'jsonMode',
				type: 'boolean',
				default: false,
				description: 'Whether to force the model to respond with valid JSON',
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

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const credentials = await this.getCredentials('aegisApi');
		const endpoint = credentials.endpoint as string;
		const apiKey = credentials.apiKey as string;

		for (let i = 0; i < items.length; i++) {
			const model = this.getNodeParameter('model', i) as string;
			const systemPrompt = this.getNodeParameter('systemPrompt', i, '') as string;
			const userMessage = this.getNodeParameter('userMessage', i) as string;
			const temperature = this.getNodeParameter('temperature', i) as number;
			const maxTokens = this.getNodeParameter('maxTokens', i) as number;
			const jsonMode = this.getNodeParameter('jsonMode', i) as boolean;
			const project = this.getNodeParameter('project', i, '') as string;
			const workflowTag = this.getNodeParameter('workflowTag', i, '') as string;
			const providerOverride = this.getNodeParameter('providerOverride', i, 'auto') as string;

			const messages: Array<{ role: string; content: string }> = [];
			if (systemPrompt) {
				messages.push({ role: 'system', content: systemPrompt });
			}
			messages.push({ role: 'user', content: userMessage });

			const metadata: Record<string, string> = { source: 'n8n-nodes-aegis' };
			if (workflowTag) metadata.workflow_tag = workflowTag;
			if (project) metadata.project = project;
			if (providerOverride && providerOverride !== 'auto') metadata.provider = providerOverride;

			const body: Record<string, unknown> = {
				model,
				messages,
				temperature,
				metadata,
			};

			if (maxTokens > 0) body.max_tokens = maxTokens;
			if (jsonMode) body.response_format = { type: 'json_object' };

			const response = await this.helpers.httpRequest({
				method: 'POST',
				url: `${endpoint}/v1/chat/completions`,
				headers: {
					'Content-Type': 'application/json',
					'x-aegis-key': apiKey,
				},
				body,
				returnFullResponse: true,
			});

			const responseBody = response.body as {
				choices?: Array<{ message?: { content?: string; role?: string } }>;
				model?: string;
				usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
			};
			const headers = response.headers as Record<string, string>;

			returnData.push({
				json: {
					content: responseBody.choices?.[0]?.message?.content ?? '',
					role: responseBody.choices?.[0]?.message?.role ?? 'assistant',
					model: responseBody.model ?? model,
					usage: responseBody.usage ?? {},
					requestId: headers['x-aegis-request-id'] ?? '',
					cost: headers['x-aegis-cost'] ?? '',
					effectiveModel: headers['x-aegis-model'] ?? '',
				},
			});
		}

		return [returnData];
	}
}

export default AegisAi;
