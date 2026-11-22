import {chromium} from 'playwright';
import {createServer} from 'vite';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
const shots=process.env.SCREENSHOT_DIR || os.tmpdir();
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const server=await createServer({root:process.cwd(),server:{port:5173,host:'127.0.0.1'}});await server.listen();
const base={onboarded:true,profile:{name:'Test student',grade:'الصف الثالث الثانوي',section:'',school:'',goal:''},settings:{language:'ar'}};
let checks=0;
async function boot(data=base,{width=390,role='student',delay=0,fail=false,pageName='curriculum',cloud=null}={}){
 const context=await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce'});
 await context.route('**/api/**',async route=>{
  const endpoint=new URL(route.request().url()).pathname;
  if(endpoint==='/api/auth/me')return route.fulfill({json:{user:{id:'track-test',name:'Test student',email:'test@example.test',role}}});
  if(endpoint==='/api/data'&&route.request().method()==='GET'){
   if(delay)await new Promise(r=>setTimeout(r,delay));
   return route.fulfill({status:fail?500:200,json:fail?{error:'test failure'}:{data:cloud}});
  }
  return route.fulfill({json:{ok:true,data:null}});
 });
 await context.addInitScript(({data,pageName})=>{localStorage.setItem('thanaweya_owner','track-test');localStorage.setItem('thanaweya_page',pageName);if(!localStorage.getItem('thanaweya-os-v3'))localStorage.setItem('thanaweya-os-v3',JSON.stringify(data));},{data,pageName});
 const page=await context.newPage();await page.goto(server.resolvedUrls.local[0]);
 return {page,context,stored:()=>page.evaluate(()=>JSON.parse(localStorage.getItem('thanaweya-os-v3')))};
}
async function confirm(c,track){await c.page.locator('.trackSetup select').waitFor();await c.page.locator('.trackSetup select').selectOption(track);await c.page.locator('.trackSetup button.primary').click();await c.page.locator('.trackSetup').waitFor({state:'detached'});}
try{
 for(const [track,count,names] of [
  ['علمي رياضة',6,['الرياضيات البحتة','الرياضيات التطبيقية','الفيزياء']],
  ['علمي علوم',5,['الأحياء','الكيمياء','الفيزياء']],
  ['أدبي',5,['التاريخ','الجغرافيا','الإحصاء']]
 ]){
  const c=await boot();await c.page.locator('.trackSetup select').waitFor();assert.equal(await c.page.locator('.trackSetup select option').count(),4);assert.equal(await c.page.locator('.trackSetup button.primary').isDisabled(),true);assert.equal(await c.page.locator('.appMain').count(),0);
  await confirm(c,track);let saved=await c.stored();assert.equal(saved.profile.section,track);assert.equal(saved.curriculumTrack,track);assert.equal(saved.subjects.length,count);for(const name of names)assert.ok(saved.subjects.some(s=>s.name===name));
  if(track==='علمي رياضة')assert.equal(saved.lessons.length,160);
  const before=saved.lessons.length;await c.page.reload();await c.page.locator('.curriculumStarter').waitFor();saved=await c.stored();assert.equal(saved.lessons.length,before);assert.equal(await c.page.locator('.curriculumStarter button').count(),0);await c.page.locator('.curriculumStarter').evaluate(el=>el.scrollIntoView({block:'center'}));await c.page.screenshot({path:path.join(shots,`thanaweya-page-${track==='علمي رياضة'?'math':track==='علمي علوم'?'science':'literary'}.png`)});await c.page.locator('.curriculumStarter').screenshot({path:path.join(shots,`thanaweya-track-${track==='علمي رياضة'?'math':track==='علمي علوم'?'science':'literary'}-auto.png`)});await c.context.close();checks++;
 }
 for(const width of [320,390,1440]){
  const c=await boot(base,{width});await c.page.locator('.trackSetup select').waitFor();await c.page.locator('.trackSetup select').selectOption('علمي رياضة');assert.equal(await c.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await c.page.screenshot({path:path.join(shots,`thanaweya-track-gate-${width}.png`)});await c.context.close();checks++;
 }
 for(const legacy of ['علمى رياضه','custom old value']){
  const c=await boot({...base,profile:{...base.profile,section:legacy}});await c.page.locator('.trackSetup select').waitFor();assert.equal((await c.stored()).profile.section,legacy);await c.page.reload();await c.page.locator('.trackSetup select').waitFor();await c.context.close();checks++;
 }
 {
  const c=await boot({...base,curriculumTrack:'علمي رياضة',profile:{...base.profile,section:'علمي رياضة'}},{pageName:'settings'});const select=c.page.locator('[data-focus-key=settings-profile-section]');await select.waitFor();await select.selectOption('علمي علوم');await c.page.waitForFunction(()=>JSON.parse(localStorage.getItem('thanaweya-os-v3')).profile.section==='علمي علوم');assert.ok((await c.stored()).subjects.some(s=>s.name==='الفيزياء'));assert.equal((await c.stored()).curriculumTrack,'علمي علوم');await c.context.close();checks++;
 }
 {
  const original={...base,subjects:[{id:'custom',name:'مادة خاصة',color:'#888',priority:'high'}],units:[{id:'custom-unit',subjectId:'custom',name:'وحدة خاصة'}],lessons:[{id:'saved',unitId:'custom-unit',name:'درس منتهي',status:'completed',estimatedMinutes:90}],tasks:[{id:'task',title:'keep',done:true}]};
  const c=await boot(original);await confirm(c,'علمي رياضة');const saved=await c.stored();assert.deepEqual(saved.lessons.find(l=>l.id==='saved'),original.lessons[0]);assert.deepEqual(saved.tasks,original.tasks);assert.ok(saved.subjects.some(s=>s.id==='custom'));await c.page.locator('.curriculumStarter').evaluate(el=>el.scrollIntoView({block:'center'}));await c.page.locator('.curriculumStarter').screenshot({path:path.join(shots,'thanaweya-curriculum-auto.png')});await c.context.close();checks++;
 }
 {
  const c=await boot(base,{delay:1400,cloud:{...base,subjects:[{id:'cloud-custom',name:'Cloud saved',color:'#888',priority:'medium'}]}});await c.page.locator('.trackSetup [role=status]').waitFor();assert.equal(await c.page.locator('.trackSetup select').count(),0);await confirm(c,'أدبي');assert.ok((await c.stored()).subjects.some(s=>s.id==='cloud-custom'));await c.context.close();checks++;
 }
 {
  const c=await boot(base,{fail:true});await c.page.locator('.trackSetup button').waitFor();assert.equal(await c.page.locator('.trackSetup select').count(),0);assert.equal(await c.page.locator('.appMain').count(),0);assert.match(await c.page.locator('.trackSetup').innerText(),/حاول تاني/);await c.context.close();checks++;
 }
 {
  const c=await boot({...base,onboarded:false,onboardStep:3,xp:1});await confirm(c,'علمي رياضة');await c.page.locator('.oncard select').waitFor();assert.equal((await c.stored()).lessons.length,160);assert.equal(await c.page.locator('.oncard select').inputValue(),'علمي رياضة');await c.page.locator('.oncard select').selectOption('علمي علوم');await c.page.waitForFunction(()=>JSON.parse(localStorage.getItem('thanaweya-os-v3')).curriculumTrack==='علمي علوم');assert.ok((await c.stored()).subjects.some(s=>s.name==='الأحياء'));await c.context.close();checks++;
 }
 {
  const c=await boot(base,{role:'parent'});await c.page.getByRole('heading',{name:'متابعة الأبناء',exact:true}).waitFor();assert.equal(await c.page.locator('.trackSetup').count(),0);await c.context.close();checks++;
 }
 for(const role of ['owner','admin']){
  const c=await boot(base,{role});await c.page.locator('.curriculumStarter').waitFor();assert.equal(await c.page.locator('.trackSetup').count(),0);await c.context.close();checks++;
 }
 {
  const c=await boot({...base,settings:{language:'en'}},{width:320});await c.page.locator('.trackSetup select').waitFor();assert.match(await c.page.locator('.trackSetup').innerText(),/Choose your study track first/);assert.equal(await c.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await c.page.screenshot({path:path.join(shots,'thanaweya-track-gate-en.png')});await c.context.close();checks++;
 }
 console.log(checks+' track gate / automatic curriculum browser scenarios passed');
}finally{await server.close();await browser.close()}
