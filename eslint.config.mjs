import n8nCommunityNodes from '@n8n/eslint-plugin-community-nodes';
import n8nNodesBase from 'eslint-plugin-n8n-nodes-base';
import tsParser from '@typescript-eslint/parser';

export default [
	{
		files: ['nodes/**/*.ts', 'credentials/**/*.ts', 'shared/**/*.ts'],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				project: './tsconfig.json',
				ecmaVersion: 2022,
				sourceType: 'module',
			},
		},
		plugins: {
			'@n8n/community-nodes': n8nCommunityNodes,
			'n8n-nodes-base': n8nNodesBase,
		},
		rules: {
			...n8nCommunityNodes.configs.recommended.rules,
			...n8nNodesBase.configs.nodes.rules,
		},
	},
	{
		files: ['credentials/**/*.ts'],
		rules: { ...n8nNodesBase.configs.credentials.rules },
	},
	{ ignores: ['dist/**', 'node_modules/**', 'test/**', 'docs/**', 'future/**'] },
];
