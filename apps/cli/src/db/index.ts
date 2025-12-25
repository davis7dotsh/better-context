import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import * as schema from './schema.ts';
import { INIT_SQL } from './init-sql.ts';

export const createDb = (dbPath: string) => {
	const sqlite = new Database(dbPath);
	sqlite.exec(INIT_SQL);
	return drizzle({ client: sqlite, schema });
};

export type DB = ReturnType<typeof createDb>;
export { schema };
