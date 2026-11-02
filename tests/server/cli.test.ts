import {describe,it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {prefixExpectation,withPrefixFixture,type PrefixFixture,type CliResult} from '../fixtures/prefix-cli-fixture';

const timeout=60000;
function successful(result:CliResult){expect(result.status,result.stderr).toBe(0);return JSON.parse(result.stdout);}
function reconcile(fixture:PrefixFixture){return fixture.run('verify-count',['--reconcile','--out',fixture.paths.reconciliation,'--apply']);}
function freeze(fixture:PrefixFixture){return fixture.run('freeze',['--purpose','teaching','--reconciliation',fixture.paths.reconciliation,'--out',fixture.paths.frozen]);}

// Real isolated PostgreSQL + actual CLI subprocesses; synthetic receipts are never live evidence.
describe.skipIf(!process.env.TEST_DATABASE_URL)('CLI real PG / fresh-process synthetic checks (NOT live receipts)',()=>{
 it('dry-run leaves DB untouched and unconfigured apply/restore never reaches the provider',async()=>{
  await withPrefixFixture({count:0},async fixture=>{
   const before=await fixture.evidenceBytes();
   const dry=successful(fixture.run('seed',[],{configured:false}));
   expect(dry).toMatchObject({mode:'dry_run',eventCount:12,mainnetWritesPerformed:0});
   expect((await fixture.pool.query('SELECT count(*)::int AS n FROM events')).rows[0].n).toBe(0);
   const apply=fixture.run('seed',['--apply'],{configured:false});expect(apply.status).toBe(2);
   const input=await fixture.writeInput('valid-frozen-input.json',prefixExpectation(10).manifest);
   const restore=fixture.run('restore',[input,'--out',fixture.paths.restore,'--apply'],{configured:false});expect(restore.status).toBe(2);
   expect(await fixture.observations()).toEqual([]);expect(await fixture.evidenceBytes()).toEqual(before);
   expect((await fixture.pool.query('SELECT count(*)::int AS n FROM memory_outbox')).rows[0].n).toBe(0);
  });
 },timeout);

 it('freeze refuses missing receipt identities without changing existing evidence or freezing the scope',async()=>{
  await withPrefixFixture({count:10},async fixture=>{
   successful(reconcile(fixture));await fixture.seedExistingEvidence();const before=await fixture.evidenceBytes();
   await fixture.pool.query("UPDATE memory_receipts SET receipt_json=receipt_json-'blobId' WHERE event_id='M10'");
   const result=freeze(fixture);expect(result.status).not.toBe(0);expect(result.stderr).toContain('RECEIPT_IDENTITY_INVALID');
   expect(await fixture.evidenceBytes()).toEqual(before);
   expect((await fixture.pool.query('SELECT count(*)::int AS n FROM frozen_manifests')).rows[0].n).toBe(0);
   expect((await fixture.pool.query('SELECT frozen_version FROM scopes')).rows[0].frozen_version).toBeNull();
  });
 },timeout);

 it('freeze emits a payload-free ten-event locator and is byte-idempotent',async()=>{
  await withPrefixFixture({count:10},async fixture=>{
   successful(reconcile(fixture));const manifest=successful(freeze(fixture));
   expect(manifest).toEqual(fixture.prefix.manifest);
   const text=await readFile(fixture.paths.frozen,'utf8');expect(text).not.toContain('payload');expect(text).not.toContain('minAmountAtomic');
   expect(manifest.entries.map((entry:{eventId:string})=>entry.eventId)).toEqual(['M01','M02','M03','M04','M05','M06','M07','M08','M09','M10']);
   expect((await fixture.pool.query('SELECT frozen_version FROM scopes')).rows[0].frozen_version).toBe(manifest.manifestVersion);
   expect(successful(freeze(fixture))).toEqual(manifest);expect(await readFile(fixture.paths.frozen,'utf8')).toBe(text);
   expect((await fixture.pool.query('SELECT count(*)::int AS n FROM frozen_manifests')).rows[0].n).toBe(1);
   expect((await fixture.observations()).filter(row=>row.kind==='remember')).toEqual([]);
  });
 },timeout);

 it('same-version conflicting immutable manifest refuses export and preserves prior evidence',async()=>{
  await withPrefixFixture({count:10},async fixture=>{
   successful(reconcile(fixture));await fixture.seedExistingEvidence();const before=await fixture.evidenceBytes();
   await fixture.pool.query('INSERT INTO frozen_manifests(manifest_version,manifest_json,manifest_hash) VALUES($1,$2,$3)',[fixture.prefix.manifest.manifestVersion,{testFixtureOnly:true},'fixture:conflicting-hash']);
   const conflict=freeze(fixture);expect(conflict.status).not.toBe(0);expect(conflict.stderr).toContain('FROZEN_MANIFEST_CONFLICT');
   expect(await fixture.evidenceBytes()).toEqual(before);
   expect((await fixture.pool.query('SELECT manifest_hash FROM frozen_manifests')).rows).toEqual([{manifest_hash:'fixture:conflicting-hash'}]);
   expect((await fixture.pool.query('SELECT frozen_version FROM scopes')).rows[0].frozen_version).toBeNull();
  });
 },timeout);
});
