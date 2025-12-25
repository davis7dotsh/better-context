import { defineConfig } from 'drizzle-kit';
import { homedir } from 'os';
import { join } from 'path';

// Default data directory matches src/core/config/types.ts DEFAULT_DATA_DIRECTORY
const dataDir = join(homedir(), '.local', 'share', 'btca');

export default defineConfig({
	out: './drizzle',
	schema: './src/db/schema.ts',
	dialect: 'sqlite',
	dbCredentials: {
		url: join(dataDir, 'btca.db')
	}
});
