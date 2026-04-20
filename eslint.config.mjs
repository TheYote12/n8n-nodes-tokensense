import { config } from '@n8n/node-cli/eslint';

export default [
	...config,
	{ ignores: ['dist/**', 'node_modules/**', 'test/**', 'docs/**', 'future/**', 'icons/**'] },
];
