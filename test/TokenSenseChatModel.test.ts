import { TokenSenseChatModel } from '../nodes/TokenSenseChatModel/TokenSenseChatModel.node';

describe('TokenSenseChatModel node', () => {
	let node: TokenSenseChatModel;

	beforeEach(() => {
		node = new TokenSenseChatModel();
	});

	it('has displayName "TokenSense Chat Model"', () => {
		expect(node.description.displayName).toBe('TokenSense Chat Model');
	});

	it('has name "tokenSenseChatModel"', () => {
		expect(node.description.name).toBe('tokenSenseChatModel');
	});

	it('outputs ai_languageModel', () => {
		expect(node.description.outputs as string[]).toContain('ai_languageModel');
	});

	it('requires tokenSenseApi credential', () => {
		const creds = node.description.credentials ?? [];
		expect(creds.some((c) => c.name === 'tokenSenseApi')).toBe(true);
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

	it('workflowTag description mentions auto-detection', () => {
		const prop = node.description.properties.find((p) => p.name === 'workflowTag');
		expect(prop?.description).toMatch(/auto/i);
	});

	it('has supplyData method', () => {
		expect(typeof node.supplyData).toBe('function');
	});

	it('has loadOptions.getModels method', () => {
		expect(typeof node.methods?.loadOptions?.getModels).toBe('function');
	});
});
