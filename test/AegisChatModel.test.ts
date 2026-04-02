import { AegisChatModel } from '../nodes/AegisChatModel/AegisChatModel.node';

describe('AegisChatModel node', () => {
	let node: AegisChatModel;

	beforeEach(() => {
		node = new AegisChatModel();
	});

	it('has displayName "Aegis Chat Model"', () => {
		expect(node.description.displayName).toBe('Aegis Chat Model');
	});

	it('has name "aegisChatModel"', () => {
		expect(node.description.name).toBe('aegisChatModel');
	});

	it('outputs ai_languageModel', () => {
		expect(node.description.outputs as string[]).toContain('ai_languageModel');
	});

	it('requires aegisApi credential', () => {
		const creds = node.description.credentials ?? [];
		expect(creds.some((c) => c.name === 'aegisApi')).toBe(true);
	});

	it('has model property', () => {
		const names = node.description.properties.map((p) => p.name);
		expect(names).toContain('model');
	});

	it('has temperature property', () => {
		const names = node.description.properties.map((p) => p.name);
		expect(names).toContain('temperature');
	});

	it('has maxTokens property', () => {
		const names = node.description.properties.map((p) => p.name);
		expect(names).toContain('maxTokens');
	});

	it('has streaming property', () => {
		const names = node.description.properties.map((p) => p.name);
		expect(names).toContain('streaming');
	});

	it('has project property', () => {
		const names = node.description.properties.map((p) => p.name);
		expect(names).toContain('project');
	});

	it('has workflowTag property', () => {
		const names = node.description.properties.map((p) => p.name);
		expect(names).toContain('workflowTag');
	});

	it('has providerOverride property', () => {
		const names = node.description.properties.map((p) => p.name);
		expect(names).toContain('providerOverride');
	});

	it('has supplyData method', () => {
		expect(typeof node.supplyData).toBe('function');
	});

	it('has loadOptions.getModels method', () => {
		expect(typeof node.methods?.loadOptions?.getModels).toBe('function');
	});
});
