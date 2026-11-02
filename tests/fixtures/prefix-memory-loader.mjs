// Test-only Node preload; production scripts never import this module.
import {registerHooks} from 'node:module';
import {join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';

const testRoot=join(tmpdir(),'recallledger-prefix-tests');
for(const name of ['RECALLLEDGER_TEST_MEMORY_FIXTURE','RECALLLEDGER_TEST_MEMORY_AUDIT']){
 const value=process.env[name];
 if(!value||!resolve(value).startsWith(testRoot+sep))throw Error('WP3_SYNTHETIC_PRELOAD_REQUIRES_ISOLATED_TEST_PATHS');
}
const scriptsDirectory=fileURLToPath(new URL('../../scripts/',import.meta.url));
const adapterDirectory=fileURLToPath(new URL('../../src/adapters/memory',import.meta.url));
const wrapper=new URL('./prefix-memory-adapter.ts',import.meta.url);
const wrapperPath=fileURLToPath(wrapper);
const adapterPaths=new Set([adapterDirectory,adapterDirectory+'/index',adapterDirectory+'/index.ts',adapterDirectory+'/index.js']);
registerHooks({
 resolve(specifier,context,nextResolve){
  if(!context.parentURL||!specifier.startsWith('.'))return nextResolve(specifier,context);
  const parent=new URL(context.parentURL);
  // The wrapper's explicit import must reach the original class, not itself.
  if(fileURLToPath(parent)===wrapperPath||parent.searchParams.has('wp3-real'))return nextResolve(specifier,context);
  if(!fileURLToPath(parent).startsWith(scriptsDirectory))return nextResolve(specifier,context);
  const requested=new URL(specifier,parent);
  if(adapterPaths.has(fileURLToPath(requested)))return {url:wrapper.href,shortCircuit:true};
  return nextResolve(specifier,context);
 }
});
