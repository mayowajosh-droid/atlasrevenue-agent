import { pool } from '../src/config.js';
import { initCanonicalTables } from '../src/core/entities/db.js';

async function migrate() {
  console.log('🔄 Creating canonical tables...');
  await initCanonicalTables(pool);
  console.log('✅ Canonical tables ready');
  await pool.end();
  console.log('🎉 Migration complete!');
}

migrate().catch(console.error);
