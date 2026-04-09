import { AegisEmbeddings } from '../nodes/AegisEmbeddings/AegisEmbeddings.node';

describe('AegisEmbeddings node', () => {
	let node: AegisEmbeddings;

	beforeEach(() => {
		node = new AegisEmbeddings();
	});

	it('has displayName "TokenSense Embeddings"', () => {
		expect(node.description.displayName).toBe('TokenSense Embeddings');
	});

	it('has name "tokenSenseEmbeddings"', () => {
		expect(node.description.name).toBe('tokenSenseEmbeddings');
	});

	it('outputs ai_embedding', () => {
		expect(node.description.outputs as string[]).toContain('ai_embedding');
	});

	it('requires tokenSenseApi credential', () => {
		const creds = node.description.credentials ?? [];
		expect(creds.some((c) => c.name === 'tokenSenseApi')).toBe(true);
	});

	it('has model property', () => {
		const names = node.description.properties.map((p) => p.name);
		expect(names).toContain('model');
	});

	it('has dimensions property', () => {
		const names = node.description.properties.map((p) => p.name);
		expect(names).toContain('dimensions');
	});

	it('has loadOptions.getEmbeddingModels method', () => {
		expect(typeof node.methods?.loadOptions?.getEmbeddingModels).toBe('function');
	});

	it('has supplyData method', () => {
		expect(typeof node.supplyData).toBe('function');
	});
});
