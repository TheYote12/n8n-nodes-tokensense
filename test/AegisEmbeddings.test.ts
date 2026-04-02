import { AegisEmbeddings } from '../nodes/AegisEmbeddings/AegisEmbeddings.node';

describe('AegisEmbeddings node', () => {
	let node: AegisEmbeddings;

	beforeEach(() => {
		node = new AegisEmbeddings();
	});

	it('has displayName "Aegis Embeddings"', () => {
		expect(node.description.displayName).toBe('Aegis Embeddings');
	});

	it('has name "aegisEmbeddings"', () => {
		expect(node.description.name).toBe('aegisEmbeddings');
	});

	it('outputs ai_embedding', () => {
		expect(node.description.outputs as string[]).toContain('ai_embedding');
	});

	it('requires aegisApi credential', () => {
		const creds = node.description.credentials ?? [];
		expect(creds.some((c) => c.name === 'aegisApi')).toBe(true);
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
