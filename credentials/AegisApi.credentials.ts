import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export class AegisApi implements ICredentialType {
	name = 'tokenSenseApi';
	displayName = 'TokenSense API';
	documentationUrl = 'https://github.com/TheYote12/n8n-nodes-tokensense';
	properties: INodeProperties[] = [
		{
			displayName: 'TokenSense Endpoint',
			name: 'endpoint',
			type: 'string',
			default: 'https://api.tokensense.io',
			required: true,
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
		},
	];
	test = {
		request: {
			baseURL: '={{$credentials.endpoint}}',
			url: '/v1/models',
			headers: { 'x-tokensense-key': '={{$credentials.apiKey}}' },
		},
	};
}

export default AegisApi;
