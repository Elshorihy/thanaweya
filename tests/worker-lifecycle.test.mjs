import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';

// Execute the actual worker functions with a controlled D1 boundary. This is a
// lifecycle regression harness, not a replacement for a workerd smoke test.
const source=readFileSync(new URL('../worker/index.ts',import.meta.url),'utf8');
const names=['ensureSchema','ensurePageViews','ensureAuthSchema','ensureStudyRoomSchema','ensureAdminTools'];
function loadWorker(){
  const js=stripTypeScriptTypes(source.replace(/^import .*;\n/gm,'')
    .replace('export default {','const worker = {')
    .replace('export class StudyRoomHub','class StudyRoomHub'),{mode:'transform'})
    +'\nObject.assign(exports, {default:worker, '+names.join(',')+'});';
  const exports={};
  vm.runInNewContext(js,{
    exports,DurableObject:class {},sendNotification(){throw new Error('Unexpected push');},
    Request,Response,Headers,URL,TextEncoder,TextDecoder,crypto:webcrypto,
    console,atob,btoa,AbortController,
    setTimeout(fn,ms){const timer=setTimeout(fn,ms);timer.unref();return timer;},clearTimeout
  });
  return exports;
}
function database(onRun=()=>({success:true})){
  const calls=[];
  return {calls,prepare(sql){
    return {bind(){return this;},async run(){calls.push(sql);return onRun(sql,calls.length);},
      async first(){
        if(sql.includes('SELECT value FROM admin_settings'))return {value:'0'};
        if(sql.includes('SELECT u.role'))return {role:'user'};
        if(sql.includes('SELECT u.id,u.email'))return {id:'test-student',name:'Test student',role:'user'};
        if(sql.includes('last_seen_at'))return {last_seen_at:1};
        if(sql.includes('student_reports'))return {n:2};
        if(sql.includes('admin_messages'))return {n:3};
        return null;
      },async all(){return {results:[]};}
    };
  }};
}
async function bounded(promise){
  let timer;
  try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Blocked on another request initialization')),700);})]);}
  finally{clearTimeout(timer);}
}
for(const name of names){
  test(name+': a stalled first request does not block a later request',async()=>{
    const worker=loadWorker();
    const db=database((_,n)=>n===1?new Promise(()=>{}):{success:true});
    void worker[name]({DB:db});
    await bounded(worker[name]({DB:db}));
    assert.ok(db.calls.length>1);
  });
  test(name+': caches only successful completion',async()=>{
    const worker=loadWorker(),db=database();
    await worker[name]({DB:db});const count=db.calls.length;
    await worker[name]({DB:db});assert.equal(db.calls.length,count);
  });
  test(name+': failure remains retryable',async()=>{
    const worker=loadWorker();
    const db=database((_,n)=>{if(n===1)throw new Error('D1 unavailable');return {success:true};});
    await assert.rejects(worker[name]({DB:db}),/D1 unavailable/);
    await worker[name]({DB:db});assert.ok(db.calls.length>1);
  });
  test(name+': completion belongs to the database binding',async()=>{
    const worker=loadWorker(),a=database(),b=database();
    await worker[name]({DB:a});await worker[name]({DB:b});
    assert.ok(a.calls.length>0);assert.ok(b.calls.length>0);
  });
}
function notifications(worker,db,cookie=true){
  return worker.default.fetch(new Request('https://test.invalid/api/bridge/notifications',{
    headers:cookie?{Cookie:'thanaweya_session=test-token'}:{}
  }),{DB:db},{waitUntil(){throw new Error('Unexpected error alert');}});
}
test('notifications: healthy sequential requests keep the unread contract',async()=>{
  const worker=loadWorker(),db=database();
  for(let i=0;i<3;i++){
    const response=await bounded(notifications(worker,db));
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{ok:true,unread:5});
  }
});
test('notifications: stalled earlier schema request cannot poison the endpoint',async()=>{
  const worker=loadWorker();
  const db=database((_,n)=>n===1?new Promise(()=>{}):{success:true});
  void worker.ensureSchema({DB:db});
  const response=await bounded(notifications(worker,db));
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{ok:true,unread:5});
});
test('notifications: concurrent cold requests all complete',async()=>{
  const worker=loadWorker(),db=database();
  const responses=await bounded(Promise.all(Array.from({length:8},()=>notifications(worker,db))));
  assert.ok(responses.every(r=>r.status===200));
});
test('notifications: unauthenticated requests still require login',async()=>{
  const response=await bounded(notifications(loadWorker(),database(),false));
  assert.equal(response.status,401);
});
