// The VS Code Jest extension runs jest from the workspace root, where there was
// no config — so jest fell back to babel-jest with no TypeScript preset and
// choked on `import type`. `projects` points it at each service's own config,
// so every file is transformed by ts-jest with that service's tsconfig.
//
// Unit suites only. The integration configs live in each service's test/ folder
// and need Docker plus --experimental-vm-modules.
module.exports = {
	projects: [
		'<rootDir>/services/email-ingestion',
		'<rootDir>/services/user-management',
	],
};