import { AegisAi } from '../nodes/AegisAi/AegisAi.node';

describe('AegisAi node', () => {
	let node: AegisAi;

	beforeEach(() => {
		node = new AegisAi();
	});

	const getOperationValues = (n: AegisAi): string[] => {
		const operationProp = n.description.properties.find((p) => p.name === 'operation');
		return ((operationProp?.options as Array<{ value: string }>) ?? []).map((o) => o.value);
	};

	it('has displayName "Aegis AI"', () => {
		expect(node.description.displayName).toBe('Aegis AI');
	});

	it('has name "aegisAi"', () => {
		expect(node.description.name).toBe('aegisAi');
	});

	it('defines exactly 8 operations', () => {
		expect(getOperationValues(node)).toHaveLength(8);
	});

	it('includes chatCompletion operation', () => {
		expect(getOperationValues(node)).toContain('chatCompletion');
	});

	it('includes generateImage operation', () => {
		expect(getOperationValues(node)).toContain('generateImage');
	});

	it('includes createEmbedding operation', () => {
		expect(getOperationValues(node)).toContain('createEmbedding');
	});

	it('includes textToSpeech operation', () => {
		expect(getOperationValues(node)).toContain('textToSpeech');
	});

	it('includes transcribeAudio operation', () => {
		expect(getOperationValues(node)).toContain('transcribeAudio');
	});

	it('includes nativeAnthropic operation', () => {
		expect(getOperationValues(node)).toContain('nativeAnthropic');
	});

	it('includes nativeGemini operation', () => {
		expect(getOperationValues(node)).toContain('nativeGemini');
	});

	it('includes listModels operation', () => {
		expect(getOperationValues(node)).toContain('listModels');
	});

	it('chatCompletion model property has displayOptions configured', () => {
		const modelProp = node.description.properties.find(
			(p) => p.name === 'model' && p.displayOptions?.show?.operation,
		);
		const ops = modelProp?.displayOptions?.show?.operation as string[] | undefined;
		expect(ops).toContain('chatCompletion');
	});

	it('operation-specific properties have displayOptions', () => {
		const propsWithDisplayOptions = node.description.properties.filter(
			(p) => p.name !== 'operation' && p.displayOptions,
		);
		expect(propsWithDisplayOptions.length).toBeGreaterThan(0);
	});

	it('has execute method', () => {
		expect(typeof node.execute).toBe('function');
	});

	it('requires aegisApi credential', () => {
		const creds = node.description.credentials ?? [];
		expect(creds.some((c) => c.name === 'aegisApi')).toBe(true);
	});

	it('has loadOptions.getModels method', () => {
		expect(typeof node.methods?.loadOptions?.getModels).toBe('function');
	});
});
