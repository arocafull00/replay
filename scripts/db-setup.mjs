import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL (vercel env pull .env.local).');
const sql = neon(process.env.DATABASE_URL);
const statements = (await readFile('scripts/schema.sql', 'utf8')).split(';').map(statement => statement.trim()).filter(Boolean);
await sql.transaction(statements.map(statement => sql.query(statement)));
console.log(`Base de datos lista: ${statements.length} sentencias aplicadas.`);
