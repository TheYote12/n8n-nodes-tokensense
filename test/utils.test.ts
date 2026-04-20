import { normalizeBaseUrl } from '../shared/utils';
import { TokenSenseApi } from '../credentials/TokenSenseApi.credentials';

describe('normalizeBaseUrl', () => {
	it('leaves a clean bare origin unchanged', () => {
		expect(normalizeBaseUrl('https://api.tokensense.io')).toBe('https://api.tokensense.io');
	});

	it('strips a single trailing slash', () => {
		expect(normalizeBaseUrl('https://api.tokensense.io/')).toBe('https://api.tokensense.io');
	});

	it('strips a trailing /v1', () => {
		expect(normalizeBaseUrl('https://api.tokensense.io/v1')).toBe('https://api.tokensense.io');
	});

	it('strips a trailing /v1/', () => {
		expect(normalizeBaseUrl('https://api.tokensense.io/v1/')).toBe('https://api.tokensense.io');
	});

	it('collapses multiple trailing slashes and /v1', () => {
		expect(normalizeBaseUrl('https://api.tokensense.io//v1//')).toBe('https://api.tokensense.io');
	});

	it('coerces non-strings and trims whitespace', () => {
		expect(normalizeBaseUrl('  https://api.tokensense.io  ')).toBe('https://api.tokensense.io');
	});
});

describe('TokenSenseApi credential endpoint regex', () => {
	const getRegex = (): RegExp => {
		const cred = new TokenSenseApi();
		const endpointProp = cred.properties.find((p) => p.name === 'endpoint');
		const pattern = (endpointProp?.typeOptions as { regexp?: { regex?: string } })?.regexp?.regex;
		if (!pattern) throw new Error('endpoint regex missing');
		return new RegExp(pattern);
	};

	it('accepts a bare https origin', () => {
		expect(getRegex().test('https://api.tokensense.io')).toBe(true);
	});

	it('accepts a bare http origin (self-hosted proxies)', () => {
		expect(getRegex().test('http://localhost:8080')).toBe(true);
	});

	it('accepts a single trailing slash', () => {
		expect(getRegex().test('https://api.tokensense.io/')).toBe(true);
	});

	it('rejects a trailing /v1', () => {
		expect(getRegex().test('https://api.tokensense.io/v1')).toBe(false);
	});

	it('rejects an arbitrary path', () => {
		expect(getRegex().test('https://api.tokensense.io/foo')).toBe(false);
	});

	it('rejects nested paths', () => {
		expect(getRegex().test('https://api.tokensense.io/foo/v1')).toBe(false);
	});
});
