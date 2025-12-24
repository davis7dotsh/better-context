/**
 * Sync Drizzle schema to init-sql.ts
 *
 * Reads generated SQL migrations from drizzle/ folder and creates
 * an embeddable INIT_SQL constant for runtime table creation.
 *
 * Run: bun run db:sync
 */

import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

const DRIZZLE_DIR = './drizzle';
const OUTPUT_FILE = './src/db/init-sql.ts';

async function main() {
	const files = (await readdir(DRIZZLE_DIR)).filter((f) => f.endsWith('.sql')).sort();

	if (files.length === 0) {
		console.error('No SQL files found in drizzle/ folder. Run `bun run db:generate` first.');
		process.exit(1);
	}

	let sql = '';
	for (const file of files) {
		const content = await readFile(join(DRIZZLE_DIR, file), 'utf-8');
		sql += content + '\n';
	}

	// Clean up drizzle-kit markers and wrap CREATE statements with IF NOT EXISTS
	// Convert backticks to double quotes (SQLite standard quoting, safe in template literals)
	const idempotentSql = sql
		.replace(/--> statement-breakpoint\n?/g, '\n')
		.replace(/`/g, '"')
		.replace(/CREATE TABLE/g, 'CREATE TABLE IF NOT EXISTS')
		.replace(/CREATE INDEX/g, 'CREATE INDEX IF NOT EXISTS');

	const output = `// Auto-generated from drizzle schema - do not edit manually
// Run: bun run db:sync

export const INIT_SQL = \`
${idempotentSql.trim()}
\`;
`;

	await writeFile(OUTPUT_FILE, output);
	console.log('Generated src/db/init-sql.ts');
}

main().catch(console.error);
