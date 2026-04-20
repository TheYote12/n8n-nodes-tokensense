import { TokenSenseApi } from '../credentials/TokenSenseApi.credentials';

describe('TokenSenseApi credential', () => {
	let cred: TokenSenseApi;

	beforeEach(() => {
		cred = new TokenSenseApi();
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

	it('authenticate block injects x-tokensense-key header from credential expression', () => {
		const headers = cred.authenticate.properties.headers as Record<string, string>;
		expect(headers['x-tokensense-key']).toBe('={{$credentials.apiKey}}');
	});

	it('endpoint property has a bare-origin regex validator', () => {
		const endpoint = cred.properties.find((p) => p.name === 'endpoint');
		const pattern = (endpoint?.typeOptions as { regexp?: { regex?: string } })?.regexp?.regex;
		expect(pattern).toBeDefined();
		expect(new RegExp(pattern as string).test('https://api.tokensense.io')).toBe(true);
		expect(new RegExp(pattern as string).test('https://api.tokensense.io/v1')).toBe(false);
	});
});
