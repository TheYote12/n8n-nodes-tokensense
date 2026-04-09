import { AegisApi } from '../credentials/AegisApi.credentials';

describe('AegisApi credential', () => {
	let cred: AegisApi;

	beforeEach(() => {
		cred = new AegisApi();
	});

	it('has name "tokenSenseApi"', () => {
		expect(cred.name).toBe('tokenSenseApi');
	});

	it('has displayName "TokenSense API"', () => {
		expect(cred.displayName).toBe('TokenSense API');
	});

	it('defines endpoint and apiKey properties', () => {
		const names = cred.properties.map((p) => p.name);
		expect(names).toContain('endpoint');
		expect(names).toContain('apiKey');
	});

	it('endpoint default is production URL', () => {
		const endpoint = cred.properties.find((p) => p.name === 'endpoint');
		expect(endpoint?.default).toBe('https://api.tokensense.io');
	});

	it('apiKey is a password field', () => {
		const apiKey = cred.properties.find((p) => p.name === 'apiKey');
		expect(apiKey?.typeOptions).toMatchObject({ password: true });
	});

	it('test.request calls GET /v1/models', () => {
		expect(cred.test.request.url).toBe('/v1/models');
	});

	it('test.request sends x-tokensense-key header', () => {
		expect(cred.test.request.headers?.['x-tokensense-key']).toBeDefined();
	});
});
