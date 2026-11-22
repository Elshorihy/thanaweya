// Run against a local Vite server. All API requests are intercepted.
// Install Playwright locally without changing package.json, then run this file.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:5173';
let checked=0;
const sections=['home','level','games','lectures','mission','challenge','dna','memory','time','rpg','curriculum','schedule','plan','tasks','review','questions','mistakes','notes','calendar','focus','stats','achievements','mods','settings','competitions','community','studyRooms','family'];
const fixture={id:'ui-test',name:'Demo student',email:'demo@example.test',role:'student'};
async function mock(context,user=null){
 await context.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  const result=path==='/api/auth/me'?{user}:path==='/api/data'?{data:null}:path==='/api/auth/register/start'?{ok:true,delivery:'email'}:{};
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
 });
}
for(const width of [320,390,1440]){
 const context=await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce'});
 await mock(context);const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.locator('.newLanding').waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 const targets=await page.locator('.nl-navlinks a').evaluateAll(links=>links.map(a=>!!document.querySelector(a.getAttribute('href'))));assert.ok(targets.every(Boolean));
 await page.locator('.nl-actions .nl-btn-main').click();await page.locator('.authGateForm').waitFor();
 if(width<620){
  assert.equal(await page.locator('[name=email]').evaluate(el=>getComputedStyle(el).fontSize),'16px');
  assert.ok((await page.locator('.authGateForm .primary').boundingBox()).y<700);
 }
 await page.locator('[name=name]').fill('Demo Student');await page.locator('[name=email]').fill('demo@example.test');
 await page.locator('[name=password]').fill('local-test-fixture');await page.locator('[name=tel]').fill('+201000000000');
 await page.locator('.authLanguage').click();await page.waitForFunction(()=>document.documentElement.lang==='en');
 await page.waitForFunction(()=>document.querySelector('.authGateForm .primary')?.textContent==='Send verification code');
 assert.equal(await page.locator('[name=email]').inputValue(),'demo@example.test');
 assert.equal(await page.locator('[name=password]').getAttribute('autocomplete'),'new-password');
 assert.equal(await page.locator('[name=tel]').getAttribute('autocomplete'),'tel');
 await page.locator('.authGateForm .primary').click();await page.waitForFunction(()=>document.querySelector('.otpInputs'));
 await page.waitForFunction(()=>document.body.innerText.includes('Verify and create account'));
 assert.deepEqual(errors,[]);await context.close();checked++;
}
for(const section of sections){
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 await context.addInitScript(({section})=>{
  localStorage.setItem('thanaweya_page',section);localStorage.setItem('thanaweya_owner','ui-test');
  localStorage.setItem('thanaweya-os-v3',JSON.stringify({onboarded:true,settings:{language:'en'},profile:{name:'Demo student'}}));
 },{section});
 await mock(context,fixture);const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.locator('.appMain').waitFor();
 // Wait for the language observer to settle after API-backed screen mounting.
 await page.waitForFunction(()=>document.querySelector('.appMain')&&!/[\u0621-\u064a]/u.test(document.querySelector('.appMain').innerText));
 const arabic=await page.locator('.appMain').evaluate(el=>{
  const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT),found=[];
  while(w.nextNode())if(/[\u0621-\u064a]/u.test(w.currentNode.nodeValue)&&!w.currentNode.parentElement.closest('[translate="no"]'))found.push(w.currentNode.nodeValue);
  return found;
 });
 assert.deepEqual(arabic,[],`${section}: untranslated empty-state copy`);
 assert.deepEqual(errors,[],`${section}: page errors`);
 if(section==='home'){
  await page.evaluate(()=>{const p=document.createElement('p');p.id='translation-probe';p.textContent='خطوتك الجاية';document.querySelector('.appMain').append(p)});
  await page.waitForFunction(()=>document.querySelector('#translation-probe')?.textContent==='Your next step');
  await page.evaluate(()=>document.querySelector('#translation-probe').firstChild.nodeValue='ملخص يومك');
  await page.waitForFunction(()=>document.querySelector('#translation-probe')?.textContent==='Your day at a glance');
  await page.locator('.headActions button').first().click();
  await page.waitForFunction(()=>document.documentElement.lang==='ar');
  // The keyed app remounts when changing language; no stale translated DOM remains.
  await page.waitForFunction(()=>document.querySelector('.homeGreeting')?.textContent.includes('أهلاً يا'));
 }
 await context.close();checked++;
}
for(const width of [320,390]){
 const context=await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce'});
 await context.addInitScript(()=>{localStorage.setItem('thanaweya_page','home');localStorage.setItem('thanaweya_owner','ui-test');localStorage.setItem('thanaweya-os-v3',JSON.stringify({onboarded:true,settings:{language:'en'},profile:{name:'Demo student'}}))});
 await mock(context,fixture);const page=await context.newPage();await page.goto(base);await page.waitForFunction(()=>document.querySelector('.homeGreeting')?.textContent.includes('Welcome'));
 assert.equal(await page.locator('.app').evaluate(el=>getComputedStyle(el).direction),'ltr');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.doesNotMatch(await page.locator('.progressInsight').innerText(),/[\u0621-\u064a]/u);
 await page.evaluate(async()=>{for(let frame=0;frame<30;frame++){await new Promise(requestAnimationFrame);if(/[\u0621-\u064a]/u.test(document.querySelector('.progressInsight').innerText+document.querySelector('.homeGreeting').innerText))throw Error('Arabic copy flashed in English mode')}});
 const support=await page.locator('.supportLauncher').boundingBox();const nav=await page.locator('.bottomNav').boundingBox();assert.ok(support.y+support.height<nav.y);
 await context.close();checked++;
}
console.log(`${checked} frontend smoke scenarios passed. API calls were mocked; no real account was created or changed.`);
await browser.close();
