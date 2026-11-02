import {Pool} from 'pg';import {readFileSync} from 'node:fs';
if(!process.env.DATABASE_URL)throw Error('DATABASE_URL required; no database modified');
const pool=new Pool({connectionString:process.env.DATABASE_URL});try{await pool.query(readFileSync('migrations/001_initial.sql','utf8'));console.log('Migration applied');}finally{await pool.end();}
