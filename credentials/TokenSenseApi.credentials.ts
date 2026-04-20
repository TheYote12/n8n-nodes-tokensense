import type {
	IAuthenticateGeneric,
	ICredentialType,
	ICredentialTestRequest,
	INodeProperties,
} from 'n8n-workflow';

export class TokenSenseApi implements ICredentialType {
	name = 'tokenSenseApi';
	displayName = 'TokenSense API';
	documentationUrl = 'https://github.com/TheYote12/n8n-nodes-tokensense';
	icon = 'file:icons/tokensense.svg' as const;

	properties: INodeProperties[] = [
		{
			displayName: 'TokenSense Endpoint',
			name: 'endpoint',
			type: 'string',
			default: 'https://api.tokensense.io',
			placeholder: 'https://api.tokensense.io',
			description:
				'Bare origin only — do NOT include /v1. Correct: https://api.tokensense.io. Incorrect: https://api.tokensense.io/v1',
			required: true,
			typeOptions: {
				// Bare origin only — no path segments. Optional trailing slash allowed (stripped by
				// the credential test and by normalizeBaseUrl at runtime).
				regexp: {
					regex: '^https?://[^/?#]+/?$',
					errorMessage:
						'Enter the bare origin only, for example https://api.tokensense.io. Do not include /v1 or any path.',
				},
			},
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

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'x-tokensense-key': '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			// Runtime-safe: String() coerces, trim() + replace() strip trailing slashes.
			// No /v1 stripping here — the property-level regex blocks /v1 at end, so
			// the constructed URL is always origin + '/v1/models'.
			baseURL: '={{ String($credentials.endpoint).trim().replace(/\\/+$/, "") }}',
			url: '/v1/models',
		},
	};
}

export default TokenSenseApi;
