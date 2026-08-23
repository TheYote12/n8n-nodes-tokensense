import type {
	ILoadOptionsFunctions,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	ISupplyDataFunctions,
	SupplyData,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';
import { supplyModel } from '@n8n/ai-node-sdk';
import { buildMetadata, loadModels, normalizeBaseUrl } from '../../shared/utils';
import { makeTokenSenseFailedAttemptHandler } from '../../shared/errors';

export class TokenSenseChatModel implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'TokenSense Chat Model',
		name: 'tokenSenseChatModel',
		icon: { light: 'file:../../icons/tokensense-light.svg', dark: 'file:../../icons/tokensense-dark.svg' },
		group: ['transform'],
		version: 1,
		description: 'Use TokenSense as a Chat Model in AI Agent workflows',
		subtitle: 'Chat Model',
		defaults: { name: 'TokenSense Chat Model' },
		codex: {
			categories: ['AI'],
			subcategories: { AI: ['Language Models', 'Chat Models'] },
			resources: {
				primaryDocumentation: [{ url: 'https://tokensense.io/docs/integrations/n8n/reference' }],
			},
		},
		inputs: [],
		outputs: [NodeConnectionTypes.AiLanguageModel],
		credentials: [{ name: 'tokenSenseApi', required: true }],
		properties: [
			{
				displayName: 'Model Name or ID',
				name: 'model',
				type: 'options',
				default: 'gpt-4.1-mini',
				required: true,
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
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
					{ name: 'Anthropic', value: 'anthropic' },
					{ name: 'Auto', value: 'auto' },
					{ name: 'Google', value: 'google' },
					{ name: 'Mistral', value: 'mistral' },
					{ name: 'OpenAI', value: 'openai' },
					{ name: 'xAI', value: 'xai' },
				],
			},
		],
	};

	methods = {
		loadOptions: {
			async getModels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return loadModels.call(this);
			},
		},
	};

	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
		const credentials = await this.getCredentials('tokenSenseApi');
		const model = this.getNodeParameter('model', itemIndex) as string;
		const temperature = this.getNodeParameter('temperature', itemIndex) as number;
		const maxTokens = this.getNodeParameter('maxTokens', itemIndex) as number;
		const streaming = this.getNodeParameter('streaming', itemIndex, true) as boolean;

		const metadata = buildMetadata(this, itemIndex, { includeProvider: true });
		const baseUrl = `${normalizeBaseUrl(credentials.endpoint as string)}/v1`;

		return supplyModel(this, {
			type: 'openai',
			baseUrl,
			model,
			apiKey: credentials.apiKey as string,
			temperature,
			streaming,
			...(maxTokens > 0 ? { maxTokens } : {}),
			additionalParams: { metadata },
			// Keeps the TokenSense error envelope (error_class, retryable,
			// retry_after_seconds) readable on the LangChain path, which never reaches
			// TokenSenseAi's execute() catch block. See the handler for the known gap:
			// this connection type has no JSON output, so the envelope survives as
			// message + description text only, not as branchable $json.
			onFailedAttempt: makeTokenSenseFailedAttemptHandler(() => this.getNode()),
		});
	}
}

export default TokenSenseChatModel;
