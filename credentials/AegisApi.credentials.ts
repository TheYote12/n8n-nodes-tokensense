import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export class AegisApi implements ICredentialType {
	name = 'aegisApi';
	displayName = 'Aegis AI API';
	documentationUrl = 'https://github.com/TheYote12/n8n-nodes-aegis';
	properties: INodeProperties[] = [
		{
			displayName: 'Aegis Endpoint',
			name: 'endpoint',
			type: 'string',
			default: 'https://aegis-core-production-dc6f.up.railway.app',
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
			headers: { 'x-aegis-key': '={{$credentials.apiKey}}' },
		},
	};
}

export default AegisApi;
