/** Prepared only. Never run without explicit approval of regular Playwright fallback. */
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
if (process.env.RECALLLEDGER_BROWSER_FALLBACK_APPROVED !== 'yes') {
  throw new Error('NOT RUN: explicit user approval of regular Playwright fallback is required.');
}
const output = new URL('../../evidence/browser/playwright/', import.meta.url).pathname;
await mkdir(output,{recursive:true});
const checks=[];const errors=[];const consoleMessages=[];const screenshots=[];
const server=spawn(process.execPath,['dist/server/main.js'],{cwd:new URL('../..',import.meta.url),env:{PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'test',HOST:'127.0.0.1',PORT:'3000',APP_ORIGIN:'http://localhost:3000',ALLOW_MAINNET_MEMORY_WRITES:'false'},stdio:['ignore','pipe','pipe']});
let serverLog='';server.stdout.on('data',b=>serverLog+=b);server.stderr.on('data',b=>serverLog+=b);
let browser;let context;
const check=async(name,fn)=>{try{await fn();checks.push({name,status:'PASS'});}catch(e){checks.push({name,status:'FAIL',error:String(e)});throw e;}};
try {
  // The HTTP server and browser deliberately share this single process invocation/network namespace.
  for(let i=0;i<100;i++){if(server.exitCode!==null)throw Error('Owned fixture server exited before ready: '+serverLog);if(!serverLog.includes('RecallLedger listening on 3000')){if(i===99)throw Error('Owned server startup timed out');await new Promise(r=>setTimeout(r,100));continue;}try{const r=await fetch('http://localhost:3000/api/health');if(r.ok)break;}catch{}if(i===99)throw Error('Server did not become reachable');await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true});
  context=await browser.newContext({viewport:{width:1440,height:1000},permissions:['clipboard-read','clipboard-write'],...(process.env.RECORD_VIDEO==='yes'?{recordVideo:{dir:output+'video',size:{width:1440,height:1000}}}:{})});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(['error','warning'].includes(m.type()))consoleMessages.push({type:m.type(),text:m.text()});});
  const shot=async(name)=>{const file=output+name+'.png';await page.screenshot({path:file,fullPage:true});screenshots.push({file,viewport:page.viewportSize()});if(process.env.DEMO_HOLD_MS)await page.waitForTimeout(Number(process.env.DEMO_HOLD_MS));};
  await page.goto('http://localhost:3000');
  await check('identity and nonblank recorded page',async()=>{await expect(page.getByRole('heading',{name:'Your transfers, understood.'})).toBeVisible();await expect(page.getByText('Recorded scenario · Read only',{exact:true})).toBeVisible();expect(page.url()).toBe('http://localhost:3000/');expect(await page.title()).toContain('RecallLedger');});
  await shot('00-recorded');
  await page.getByText('Operator tools · protected local session',{exact:true}).click();await expect(page.getByText('Operator session unavailable.',{exact:true})).toBeVisible();await shot('01-operator-disabled');
  await page.getByRole('button',{name:'Replay the correction',exact:true}).click();
  for(let step=1;step<=12;step++){
    const composer=page.locator('.composer');await expect(composer.getByText(`SANDBOX · STEP ${step} / 12`,{exact:true})).toBeVisible();
    if(step===3){await composer.getByLabel('Purpose',{exact:true}).selectOption('internal_transfer');await expect(composer.getByLabel('Purpose',{exact:true})).toHaveValue('internal_transfer');await composer.getByLabel('Purpose',{exact:true}).selectOption('expense');}
    if(step===4||step===8){const max=composer.getByLabel('Maximum (atomic units)',{exact:true});const target=step===4?'30000000':'20000000';await max.fill('21000000');await expect(max).toHaveValue('21000000');await max.fill(target);await composer.getByText('Exact scope · review every condition',{exact:true}).click();await shot(`scope-M${String(step).padStart(2,'0')}`);}
    if(step===7){await composer.getByLabel('Purpose',{exact:true}).selectOption('reimbursement');await composer.getByLabel('Why are you correcting it?',{exact:true}).fill('Synthetic QA: this was reimbursement, not Tools.');}
    if(step===10){await expect(composer.getByLabel('Incoming transfer',{exact:true})).toHaveValue('fixture:tx-D');await expect(composer.getByLabel('Original expense',{exact:true})).toHaveValue('fixture:tx-B');}
    const before=await page.locator('.stats').innerText();
    await check(`M${String(step).padStart(2,'0')} explicit confirmation / pending / completion`,async()=>{
      const submit=composer.getByRole('button');await expect(submit).toBeDisabled();await composer.getByRole('checkbox').check();await submit.dblclick();
      await expect(page.getByRole('heading',{name:'Confirmed · Saving memory…',exact:true})).toBeVisible();expect(await page.locator('.stats').innerText()).toBe(before);await expect(page.locator('.composer')).toHaveCount(0);await expect(page.getByText(`Teaching session · ${step-1} of 12 changes confirmed`,{exact:true})).toBeVisible();
      await shot(`M${String(step).padStart(2,'0')}-pending`);await page.getByRole('button',{name:'Complete fixture job',exact:true}).click();await expect(page.getByText(`Teaching session · ${step} of 12 changes confirmed`,{exact:true})).toBeVisible();
    });
    if(step===6)await expect(page.locator('.stats').getByText('49.00',{exact:false})).toBeVisible();
    if(step===7)await expect(page.locator('.stats').getByText('24.00',{exact:false})).toBeVisible();
    if(step===10)await expect(page.locator('.stats').getByText('12.00',{exact:false})).toBeVisible();
    await shot(`M${String(step).padStart(2,'0')}-completed`);
  }
  await check('evidence copy, modal focus and Escape restore',async()=>{
    const opener=page.getByRole('button',{name:'View evidence',exact:true});await opener.click();const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();expect(await dialog.evaluate(el=>el.contains(document.activeElement))).toBe(true);
    await dialog.getByRole('button',{name:'Copy evidence',exact:true}).click();await expect(dialog.getByText('Copied evidence',{exact:true})).toBeVisible();expect(JSON.parse(await page.evaluate(()=>navigator.clipboard.readText())).memoryReceipt).toBeNull();await shot('evidence-copy');
    await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(opener).toBeFocused();
    await opener.click();await page.getByRole('button',{name:'Close evidence',exact:true}).click();await expect(dialog).not.toBeVisible();
  });
  await expect(page.locator('.stats').getByText('25.00',{exact:false})).toBeVisible();await expect(page.getByText('Scenario complete.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Memory',exact:true}).click();await expect(page.locator('.timeline > li')).toHaveCount(12);await page.getByText('View event and exact scope',{exact:true}).first().click();await shot('memory-timeline');
  await page.getByRole('button',{name:'Check fixture restoration',exact:true}).click();await expect(page.getByText('Fixture restore report',{exact:true})).toBeVisible();await shot('fixture-restore');
  await page.getByRole('button',{name:'Replay',exact:true}).click();
  let eHash;
  for(const input of ['B','E'])for(const seq of ['4','8','12']){
    await page.getByLabel('Fixed synthetic input',{exact:true}).selectOption(input);await page.getByLabel('Memory snapshot',{exact:true}).selectOption(seq);
    await check(`same input ${input} memory off/on as-of M${seq}`,async()=>{const results=page.locator('.result');await expect(results).toHaveCount(2);await expect(results.nth(0).getByRole('heading',{name:'Needs context',exact:true})).toBeVisible();const expected=seq==='12'||input==='E'&&seq==='8'?'Needs context':'Expense';await expect(results.nth(1).getByRole('heading',{name:expected,exact:true})).toBeVisible();const hash=page.locator('details.hash');if(!await hash.getAttribute('open'))await hash.locator('summary').click();await expect(hash.getByText('Input hashes match. Only the memory snapshot changes.',{exact:true})).toBeVisible();const value=await hash.locator('p.break').innerText();if(input==='E'){if(eHash)expect(value).toBe(eHash);else eHash=value;}});await shot(`replay-${input}-M${seq}`);
  }
  await page.getByRole('button',{name:'Inbox',exact:true}).click();
  for(const width of [375,768,1440]){await page.setViewportSize({width,height:1000});await check(`viewport ${width} no horizontal overflow`,async()=>{expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await expect(page.getByRole('button',{name:'Inbox',exact:true})).toBeVisible();});await shot(`viewport-${width}`);await page.getByRole('button',{name:'View evidence',exact:true}).click();await shot(`viewport-${width}-evidence`);await page.keyboard.press('Escape');}
  // Deliberate local transport fault only; never substitute successful API data.
  await page.route('**/api/demo',route=>route.abort('failed'));await page.reload();await expect(page.getByRole('alert')).toBeVisible();await shot('injected-read-failure');await page.unroute('**/api/demo');await page.getByRole('button',{name:'Reload current state',exact:true}).click();await expect(page.getByRole('heading',{name:'Your transfers, understood.'})).toBeVisible();await shot('retry-recovered');checks.push({name:'injected read transport failure and user retry',status:'PASS'});
  checks.push({name:'console page errors',status:errors.length?'FAIL':'PASS',errors});
  for(const name of ['rate-limited UI','unsupported transaction UI','conflicting rules UI','incomplete restore UI','failed remote outbox retry UI','operator live writes','literal memory on/off toggle (current UI uses simultaneous comparison columns)'])checks.push({name,status:'BLOCKED',reason:'No configured fixture UI control for this state; no live credentials or writes authorized for E2E.'});
}catch(e){checks.push({name:'run completion',status:'FAIL',error:String(e)});process.exitCode=1;}
finally{if(context)await context.close();if(browser)await browser.close();server.kill('SIGTERM');await writeFile(output+'results.json',JSON.stringify({executedAt:new Date().toISOString(),provider:'fixture',browser:'regular Playwright / system Chromium',authorization:'explicit fallback approval required and env gate enabled',checks,errors,consoleMessages,screenshots,bundleFiles:await readdir(new URL('../../dist/web/assets',import.meta.url)),serverLog},null,2));}
