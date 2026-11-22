import {chromium} from 'playwright';
import {createServer} from 'vite';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
const root=process.cwd();
const shots=process.env.SCREENSHOT_DIR || os.tmpdir();
const browser = await chromium.launch({headless:true,args:['--no-sandbox']});
const user={id:'track-test',name:'Test student',email:'test@example.test',role:'student'};
let checks=0;
async function pageFor(server, data, width=390, pageName='settings'){
 const context=await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce'});
 await context.route('**/api/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(new URL(route.request().url()).pathname==='/api/auth/me'?{user}: {data:null})}));
 await context.addInitScript(({data,pageName})=>{localStorage.setItem('thanaweya_owner','track-test');localStorage.setItem('thanaweya_page',pageName);if(!localStorage.getItem('thanaweya-os-v3'))localStorage.setItem('thanaweya-os-v3',JSON.stringify(data));},{data,pageName});
 const page=await context.newPage();await page.goto(server.resolvedUrls.local[0]);await page.waitForTimeout(400);return {page,context};
}
const base={onboarded:true,profile:{name:'Test student',grade:'الصف الثالث الثانوي',section:'علمي رياضة',school:'',goal:''},settings:{language:'ar'}};
let c;
const after=await createServer({root,server:{port:5173,host:'127.0.0.1'}});await after.listen();
try {
 c=await pageFor(after,{...base,xp:1,onboarded:false,onboardStep:3});await c.page.locator('.oncard select').waitFor();assert.equal(await c.page.locator('.oncard select option').count(),4);await c.page.locator('.oncard select').evaluate(el=>el.scrollIntoView({block:'center'}));await c.page.screenshot({path:path.join(shots,'thanaweya-track-after.png')});await c.context.close();checks++;
 for(const width of [320,390,1440]){
  c=await pageFor(after,base,width);const select=c.page.locator('[data-focus-key=settings-profile-section]');await select.waitFor();await select.selectOption('علمي علوم');await c.page.waitForTimeout(200);assert.equal(JSON.parse(await c.page.evaluate(()=>localStorage.getItem('thanaweya-os-v3'))).profile.section,'علمي علوم');await c.page.reload();await select.waitFor();assert.equal(await select.inputValue(),'علمي علوم');assert.equal(await c.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await c.context.close();checks++;
 }
 for(const legacy of ['علمى رياضه','custom old value']){
  c=await pageFor(after,{...base,profile:{...base.profile,section:legacy}});const select=c.page.locator('[data-focus-key=settings-profile-section]');await select.waitFor();assert.equal(await select.inputValue(),legacy==='علمى رياضه'?'علمي رياضة':legacy);assert.equal(JSON.parse(await c.page.evaluate(()=>localStorage.getItem('thanaweya-os-v3'))).profile.section,legacy);await c.context.close();checks++;
 }
 c=await pageFor(after,base,390,'curriculum');await c.page.locator('.curriculumStarter button').waitFor();await c.page.locator('.curriculumStarter button').click();await c.page.waitForTimeout(250);let seed=JSON.parse(await c.page.evaluate(()=>localStorage.getItem('thanaweya-os-v3')));assert.equal(seed.subjects.length,6);const count=seed.lessons.length;assert.equal(count,69);await c.page.locator('.curriculumStarter button').click();await c.page.waitForTimeout(200);seed=JSON.parse(await c.page.evaluate(()=>localStorage.getItem('thanaweya-os-v3')));assert.equal(seed.lessons.length,count);await c.page.locator('.curriculumStarter').screenshot({path:path.join(shots,'thanaweya-curriculum-card.png')});await c.context.close();checks++;
 console.log(checks+' track/curriculum browser scenarios passed');
}finally{await after.close();await browser.close()}
