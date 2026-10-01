import {sendNotification,type PushSubscription as WebPushSubscription} from "web-push-neo";

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  GREEN_API_INSTANCE_ID?: string;
  GREEN_API_TOKEN?: string;
  GREEN_API_URL?: string;
  GOOGLE_APPS_SCRIPT_URL?: string;
  GOOGLE_APPS_SCRIPT_SECRET?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
}

let schemaReady:Promise<void>|null=null;
let pageViewsReady:Promise<void>|null=null;
async function ensurePageViews(env:Env){
  if(!pageViewsReady) pageViewsReady=(async()=>{
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS site_page_views (id INTEGER PRIMARY KEY AUTOINCREMENT, day TEXT NOT NULL, created_at INTEGER NOT NULL)").run();
  })().catch(e=>{pageViewsReady=null;throw e});
  await pageViewsReady;
}
async function ensureSchema(env:Env){
  if(!schemaReady) schemaReady=(async()=>{
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,name TEXT NOT NULL,password_hash TEXT NOT NULL,password_salt TEXT NOT NULL,phone TEXT,email_verified_at INTEGER,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)").run();
    try { await env.DB.prepare("ALTER TABLE users ADD COLUMN email_verified_at INTEGER").run(); } catch {}
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS user_phones (user_id TEXT PRIMARY KEY, phone TEXT UNIQUE, updated_at INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)").run();
    try {
      await env.DB.prepare("ALTER TABLE users ADD COLUMN phone TEXT").run();
    } catch {}
    try {
      await env.DB.prepare("INSERT OR IGNORE INTO user_phones(user_id,phone,updated_at) SELECT id,phone,updated_at FROM users WHERE phone IS NOT NULL AND phone<>''").run();
    } catch {}
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)").run();
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS auth_codes (id TEXT PRIMARY KEY,email TEXT NOT NULL,type TEXT NOT NULL,code_hash TEXT NOT NULL,payload_json TEXT,expires_at INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL)").run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_auth_codes_lookup ON auth_codes(email,type,expires_at)").run();
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS user_data (user_id TEXT PRIMARY KEY,data_json TEXT NOT NULL DEFAULT '{}',updated_at INTEGER NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)").run();
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS global_lectures (id TEXT PRIMARY KEY,title TEXT NOT NULL,subject_name TEXT NOT NULL,url TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',kind TEXT NOT NULL DEFAULT 'link',enabled INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)").run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_global_lectures_subject ON global_lectures(subject_name,enabled)").run();
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS global_notifications (id TEXT PRIMARY KEY,title TEXT NOT NULL,message TEXT NOT NULL,type TEXT NOT NULL DEFAULT 'info',enabled INTEGER NOT NULL DEFAULT 1,expires_at INTEGER,created_at INTEGER NOT NULL)").run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_global_notifications_active ON global_notifications(enabled,expires_at,created_at)").run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash)").run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at)").run();
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS push_subscriptions (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,endpoint TEXT NOT NULL UNIQUE,p256dh TEXT NOT NULL,auth TEXT NOT NULL,user_agent TEXT,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)").run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id)").run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_push_subscriptions_updated ON push_subscriptions(updated_at)").run();
  })().catch(e=>{schemaReady=null;throw e});
  await schemaReady;
}
const COOKIE = "thanaweya_session";
const SESSION_DAYS = 30;

function json(data: unknown, status=200, headers: Record<string,string>={}, request?:Request) {
  const origin=request?.headers.get("Origin")||"";
  const allowed=origin==="https://thanaweya.sheenomatp.workers.dev" ? origin : "";
  return new Response(JSON.stringify(data), {status, headers: {
    "content-type":"application/json; charset=utf-8",
    "cache-control":"no-store, no-cache, must-revalidate",
    "pragma":"no-cache",
    ...(allowed?{"access-control-allow-origin":allowed,"access-control-allow-credentials":"true","vary":"Origin"}:{}),
    ...headers
  }});
}
function cleanEmail(v: unknown) { return String(v ?? "").trim().toLowerCase().slice(0,160); }
function cleanName(v: unknown) { return String(v ?? "").trim().replace(/[<>]/g,"").slice(0,80); }
function cleanPhone(v: unknown) {
  let p=String(v ?? "").replace(/[^0-9+]/g,"").replace(/^00/,"+");
  if(/^01[0125]\d{8}$/.test(p)) p="+20"+p.slice(1);
  else if(/^201[0125]\d{8}$/.test(p)) p="+"+p;
  return p.slice(0,20);
}
function validPhone(v:string) { return /^\+?[1-9]\d{7,14}$/.test(v); }
function bytesToHex(bytes: Uint8Array) { return [...bytes].map(b=>b.toString(16).padStart(2,"0")).join(""); }
function randomHex(n=32) { const a=new Uint8Array(n); crypto.getRandomValues(a); return bytesToHex(a); }
async function sha256(value:string) {
  const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(b));
}
async function hashPassword(password:string,salt:string) {
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]);
  const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt:new TextEncoder().encode(salt),iterations:100000,hash:"SHA-256"},key,256);
  return bytesToHex(new Uint8Array(bits));
}
async function verifyPassword(password:string,salt:string,hash:string) {
  return (await hashPassword(password,salt))===hash;
}
function generateOtpCode(){
  return String(Math.floor(100000+Math.random()*900000));
}
async function otpHash(email:string,type:string,code:string){
  return sha256(email+":"+type+":"+code);
}
function cookieValue(request:Request) {
  const raw=request.headers.get("Cookie")||"";
  for(const part of raw.split(";")) { const [k,...rest]=part.trim().split("="); if(k===COOKIE) return rest.join("="); }
  return "";
}
async function userFrom(request:Request,env:Env) {
  const token=cookieValue(request); if(!token) return null;
  const tokenHash=await sha256(token);
  const row=await env.DB.prepare("SELECT u.id,u.email,u.name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?").bind(tokenHash,Date.now()).first<{id:string;email:string;name:string}>();
  return row||null;
}
const sessionCookie=(token:string)=>`${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS*86400}`;
const clearCookie=()=>`${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
async function createSession(userId:string,env:Env) {
  const token=randomHex(32), hash=await sha256(token), expires=Date.now()+SESSION_DAYS*86400000;
  await env.DB.prepare("INSERT INTO sessions(id,user_id,token_hash,expires_at,created_at) VALUES(?,?,?,?,?)").bind(randomHex(16),userId,hash,expires,Date.now()).run();
  return token;
}
async function body(request:Request){try{return await request.json() as any}catch{return null}}

async function getPageViewStats(env:Env){
  const today=new Date().toISOString().slice(0,10);
  let totalUsers=0,totalVisits=0,todayVisits=0,last7DaysVisits=0;
  try{
    const row=await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first<any>();
    totalUsers=Number(row?.n||0);
  }catch(e){ console.error("Telegram users stats failed",e); }
  try{
    await ensurePageViews(env);
    const row=await env.DB.prepare("SELECT COUNT(*) AS n FROM site_page_views").first<any>();
    totalVisits=Number(row?.n||0);
  }catch(e){ console.error("Telegram total visits stats failed",e); }
  try{
    const row=await env.DB.prepare("SELECT COUNT(*) AS n FROM site_page_views WHERE day=?").bind(today).first<any>();
    todayVisits=Number(row?.n||0);
  }catch(e){ console.error("Telegram today visits stats failed",e); }
  try{
    const row=await env.DB.prepare("SELECT COUNT(*) AS n FROM site_page_views WHERE day>=date(?, '-6 day')").bind(today).first<any>();
    last7DaysVisits=Number(row?.n||0);
  }catch(e){ console.error("Telegram 7-day visits stats failed",e); }
  return {totalUsers,totalVisits,todayVisits,last7DaysVisits};
}

async function telegramCall(env:Env,method:string,payload:Record<string,unknown>){
  const r=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,{
    method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)
  });
  const data=await r.json() as any;
  if(!r.ok || !data?.ok) throw new Error(data?.description||`Telegram API error: ${r.status}`);
  return data;
}

async function greenApiCall(env:Env,phone:string,message:string){
  if(!env.GREEN_API_INSTANCE_ID||!env.GREEN_API_TOKEN) throw new Error("WhatsApp is not configured");
  const apiUrl=(env.GREEN_API_URL||"https://api.greenapi.com").replace(/\/$/,"");
  const digits=phone.replace(/\D/g,"");
  const chatId=digits+"@c.us";
  const r=await fetch(apiUrl+"/waInstance"+env.GREEN_API_INSTANCE_ID+"/sendMessage/"+env.GREEN_API_TOKEN,{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({chatId,message,linkPreview:false})
  });
  const data=await r.json() as any;
  if(!r.ok||!data?.idMessage) throw new Error(data?.message||data?.error||("GREEN-API error: "+r.status));
  return String(data.idMessage);
}

async function sendEmailOtp(env:Env,email:string,code:string,type:"register"|"reset"){
  const base=String(env.GOOGLE_APPS_SCRIPT_URL||"").trim();
  const secret=String(env.GOOGLE_APPS_SCRIPT_SECRET||"").trim();
  if(!base||!secret) throw new Error("Gmail غير مفعّل حاليًا");

  let url:URL;
  try{ url=new URL(base); }catch{ throw new Error("رابط GOOGLE_APPS_SCRIPT_URL غير صحيح."); }
  if(url.pathname.endsWith("/dev")) throw new Error("GOOGLE_APPS_SCRIPT_URL يجب أن ينتهي بـ /exec وليس /dev.");

  const u=new URL(url.toString());
  u.searchParams.set("action","otp");
  u.searchParams.set("type",type);
  u.searchParams.set("email",email);
  u.searchParams.set("code",code);
  u.searchParams.set("otpCode",code);
  u.searchParams.set("secret",secret);
  u.searchParams.set("requestId",randomHex(20));
  u.searchParams.set("_ts",String(Date.now()));

  const response=await fetch(u.toString(),{
    method:"GET",
    redirect:"follow",
    headers:{
      "accept":"application/json,text/plain,*/*",
      "cache-control":"no-cache"
    },
    cf:{cacheTtl:0,cacheEverything:false}
  } as RequestInit);

  const raw=await response.text();
  const cleaned=raw.replace(/^\\uFEFF/,"").trim();
  let data:any=null;
  try{ data=JSON.parse(cleaned); }catch{}

  if(data?.ok===true && (
    data?.sent===true ||
    data?.status==="sent" ||
    data?.status==="ok" ||
    data?.result==="sent" ||
    data?.accepted===true ||
    /otp email sent successfully|email sent successfully|تم إرسال.*كود|تم إرسال.*email/i.test(String(data?.message||""))
  )) return;

  if(data?.ok===false || data?.success===false || data?.status==="error"){
    throw new Error(String(data?.error||data?.message||"Google Apps Script فشل في إرسال كود Gmail").slice(0,400));
  }

  const sample=cleaned.replace(/\s+/g," ").slice(0,300);
  if(/ppConfig|accounts\.google\.com|ServiceLogin|Sign in/i.test(sample)){
    throw new Error("Google Apps Script وصل، لكن حساب Google يحتاج تفويض Gmail داخل مشروع Apps Script. شغّل دالة تفويض Gmail مرة واحدة ثم أعد النشر.");
  }
  throw new Error("Google Apps Script أعاد HTTP "+response.status+" لكن لم يؤكد إرسال كود Gmail."+(sample?" الرد: "+sample:""));
}
async function ensurePushSubscriptions(env:Env){
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS push_subscriptions (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,endpoint TEXT NOT NULL UNIQUE,p256dh TEXT NOT NULL,auth TEXT NOT NULL,user_agent TEXT,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)").run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id)").run();
}
function validatePushSubscription(value:any){
  const endpoint=String(value?.endpoint||"").trim();
  const p256dh=String(value?.keys?.p256dh||"").trim();
  const auth=String(value?.keys?.auth||"").trim();
  if(!/^https:\/\//i.test(endpoint)||endpoint.length>3000||!p256dh||!auth||p256dh.length>500||auth.length>500)return null;
  return {endpoint,p256dh,auth};
}
async function broadcastWebPush(env:Env,title:string,message:string,url="/"){
  if(!env.VAPID_PUBLIC_KEY||!env.VAPID_PRIVATE_KEY||!env.VAPID_SUBJECT) throw new Error("إشعارات Push غير مفعّلة: أضف VAPID_PUBLIC_KEY وVAPID_PRIVATE_KEY وVAPID_SUBJECT.");
  await ensurePushSubscriptions(env);
  const rows=await env.DB.prepare("SELECT id,user_id,endpoint,p256dh,auth FROM push_subscriptions ORDER BY updated_at DESC").all<any>();
  const items=rows.results||[];
  let sent=0,failed=0,removed=0; const errors:string[]=[];
  const payload=JSON.stringify({title:title.slice(0,120),body:message.slice(0,3000),icon:"/icons/thanaweya-192.png",badge:"/icons/thanaweya-192.png",url:url.startsWith("/")?url:"/"});
  for(const row of items){
    try{
      const result=await sendNotification(
        {endpoint:String(row.endpoint),keys:{p256dh:String(row.p256dh),auth:String(row.auth)}} as WebPushSubscription,
        payload,
        {vapidDetails:{subject:env.VAPID_SUBJECT,publicKey:env.VAPID_PUBLIC_KEY,privateKey:env.VAPID_PRIVATE_KEY},TTL:86400,urgency:"high"}
      );
      const status=Number((result as any)?.statusCode||201);
      if(status>=200&&status<300) sent++; else {failed++; if(errors.length<5)errors.push(String(row.endpoint).slice(0,80)+": HTTP "+status);}
    }catch(e){
      const status=Number((e as any)?.statusCode||0);
      if(status===404||status===410){
        await env.DB.prepare("DELETE FROM push_subscriptions WHERE id=?").bind(String(row.id)).run();
        removed++;
      }else{
        failed++;
        if(errors.length<5)errors.push((e instanceof Error?e.message:String(e)).slice(0,220));
      }
    }
  }
  return {total:items.length,sent,failed,removed,errors};
}
async function ensureWhatsAppLog(env:Env){
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS whatsapp_messages (id TEXT PRIMARY KEY,user_id TEXT,phone TEXT NOT NULL,message TEXT NOT NULL,status TEXT NOT NULL,provider_id TEXT,error TEXT,created_at INTEGER NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL)").run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_created ON whatsapp_messages(created_at)").run();
}

async function sendWhatsAppToUser(env:Env,userId:string,phone:string,message:string){
  await ensureWhatsAppLog(env);
  try{
    const providerId=await greenApiCall(env,phone,message);
    await env.DB.prepare("INSERT INTO whatsapp_messages(id,user_id,phone,message,status,provider_id,error,created_at) VALUES(?,?,?,?,?,?,?,?)").bind(randomHex(16),userId,phone,message,"sent",providerId,null,Date.now()).run();
    return {ok:true,providerId};
  }catch(e){
    const error=e instanceof Error?e.message:String(e);
    await env.DB.prepare("INSERT INTO whatsapp_messages(id,user_id,phone,message,status,provider_id,error,created_at) VALUES(?,?,?,?,?,?,?,?)").bind(randomHex(16),userId,phone,message,"failed",null,error.slice(0,500),Date.now()).run();
    await sendAdminAlert(env,"❌ فشل إرسال واتساب","📱 "+phone+"\n⚠️ "+error.slice(0,300),"whatsapp_failure",5*60*1000);
    return {ok:false,error};
  }
}

async function broadcastWhatsApp(env:Env,message:string){
  await ensureWhatsAppLog(env);
  const rows=await env.DB.prepare("SELECT u.id,p.phone FROM user_phones p JOIN users u ON u.id=p.user_id WHERE p.phone IS NOT NULL AND p.phone<>''").all<any>();
  let sent=0,failed=0; const errors:string[]=[];
  for(const row of rows.results||[]){
    const result=await sendWhatsAppToUser(env,String(row.id),String(row.phone),message);
    if(result.ok) sent++; else {failed++; if(errors.length<5) errors.push(String(row.phone)+": "+result.error);}
  }
  return {total:(rows.results||[]).length,sent,failed,errors};
}

async function broadcastEmail(env:Env,subject:string,message:string){
  const url=String(env.GOOGLE_APPS_SCRIPT_URL||"").trim();
  const secret=String(env.GOOGLE_APPS_SCRIPT_SECRET||"").trim();
  if(!url||!secret) throw new Error("Gmail غير مفعّل حاليًا");

  const rows=await env.DB.prepare("SELECT email FROM users WHERE email IS NOT NULL AND email<>'' ORDER BY created_at ASC").all<any>();
  const emails=(rows.results||[]).map((r:any)=>cleanEmail(r.email)).filter(Boolean);
  if(!emails.length) return {total:0,sent:0,failed:0,error:"لا يوجد إيميلات مسجلة"};

  const requestId=randomHex(20);
  const payload=JSON.stringify({secret,type:"broadcast",subject:subject.slice(0,180),message:message.slice(0,10000),emails,requestId});
  const r=await fetch(url,{
    method:"POST",
    redirect:"manual",
    headers:{"content-type":"application/json","accept":"application/json,text/plain,*/*"},
    body:payload
  });

  if(![200,201,202,204,301,302,303,307,308].includes(r.status)){
    const raw=await r.text();
    throw new Error("Google Apps Script HTTP "+r.status+(raw?": "+raw.slice(0,240):""));
  }

  const raw=await r.text();
  let data:any={};
  try{data=JSON.parse(raw)}catch{}
  if(data?.ok===false || data?.success===false){
    throw new Error(String(data.error||data.message||"فشل إرسال حملة Gmail").slice(0,500));
  }
  if(data?.status==="done" || data?.ok===true || data?.success===true || data?.accepted===true){
    return {
      total:Number(data.total??emails.length),
      sent:Number(data.sent??(data.total??emails.length)),
      failed:Number(data.failed??0),
      error:data.error?String(data.error):""
    };
  }
  if(/^(ok|success|sent|accepted)$/i.test(raw.trim())){
    return {total:emails.length,sent:emails.length,failed:0,error:""};
  }

  const location=r.headers.get("location");
  if(!location){
    return {total:emails.length,sent:0,failed:0,error:"Google Apps Script قبل الطلب لكن لم يُرجع رابط التنفيذ."};
  }

  const statusUrl=new URL(location);
  statusUrl.searchParams.set("action","status");
  statusUrl.searchParams.set("requestId",requestId);

  let last:any={status:"pending"};
  for(let i=0;i<16;i++){
    await new Promise(resolve=>setTimeout(resolve,750));
    try{
      const sr=await fetch(statusUrl.toString(),{
        method:"GET",
        redirect:"follow",
        headers:{"accept":"application/json,text/plain,*/*"}
      });
      const text=await sr.text();
      try{last=JSON.parse(text)}catch{last={status:"pending"}}
      if(last?.status==="done"){
        return {
          total:Number(last.total??emails.length),
          sent:Number(last.sent??0),
          failed:Number(last.failed??0),
          error:last.error?String(last.error):""
        };
      }
    }catch{}
  }

  return {
    total:emails.length,
    sent:0,
    failed:0,
    error:"Google Apps Script قبل الطلب لكن لم يُرجع حالة التنفيذ."
  };
}
async function ensureTelegramDashboard(env:Env){
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS telegram_admin_state (chat_id TEXT PRIMARY KEY, mode TEXT NOT NULL, payload_json TEXT, updated_at INTEGER NOT NULL)").run();
  try { await env.DB.prepare("ALTER TABLE telegram_admin_state ADD COLUMN payload_json TEXT").run(); } catch {}
}

function adminFormatDate(v:any){
  return new Date(Number(v||0)).toLocaleString("ar-EG",{dateStyle:"short",timeStyle:"short"});
}
function adminUserKeyboard(id:string){
  return {inline_keyboard:[
    [{text:"👤 التفاصيل",callback_data:"user_view:"+id}],
    [{text:"🚪 تسجيل خروج الكل",callback_data:"user_logout:"+id},{text:"🗑️ حذف الحساب",callback_data:"user_delete:"+id}],
    [{text:"⬅️ رجوع",callback_data:"dash_users"}]
  ]};
}
async function sendTelegramUserDetails(env:Env,chatId:string,userId:string){
  const u=await env.DB.prepare("SELECT u.id,u.name,u.email,u.email_verified_at,u.created_at,u.updated_at,p.phone FROM users u LEFT JOIN user_phones p ON p.user_id=u.id WHERE u.id=?").bind(userId).first<any>();
  if(!u){await telegramCall(env,"sendMessage",{chat_id:chatId,text:"❌ المستخدم غير موجود.",reply_markup:dashBack()});return;}
  const sessions=await env.DB.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id=? AND expires_at>?").bind(userId,Date.now()).first<any>();
  const allSessions=await env.DB.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id=?").bind(userId).first<any>();
  const data=await env.DB.prepare("SELECT data_json,updated_at,LENGTH(data_json) AS size FROM user_data WHERE user_id=?").bind(userId).first<any>();
  let appData:any={};
  if(data?.data_json){try{appData=JSON.parse(data.data_json)||{}}catch{}}
  const subjects=Array.isArray(appData?.subjects)?appData.subjects:[];
  const lessons=Array.isArray(appData?.lessons)?appData.lessons:[];
  const units=Array.isArray(appData?.units)?appData.units:[];
  const studySessions=Array.isArray(appData?.sessions)?appData.sessions:[];
  const completedLessons=lessons.filter((x:any)=>x?.completed||x?.done).length;
  const focusSeconds=studySessions.reduce((sum:number,x:any)=>sum+Number(x?.seconds||x?.durationSec||0),0);
  const settings=appData?.settings||{};
  const text=[
    "👤 ملف المستخدم الكامل",
    "",
    "🆔 ID: "+String(u.id),
    "👤 الاسم: "+String(u.name||"—"),
    "✉️ الإيميل: "+String(u.email||"—"),
    "📱 واتساب: "+String(u.phone||"غير مرتبط"),
    "🔐 التحقق: "+(u.email_verified_at?"✅ مؤكد":"⏳ غير مؤكد"),
    "🗓️ التسجيل: "+adminFormatDate(u.created_at),
    "📝 آخر تعديل للحساب: "+adminFormatDate(u.updated_at),
    "🟢 الجلسات الفعالة: "+Number(sessions?.n||0),
    "📊 إجمالي الجلسات المسجلة: "+Number(allSessions?.n||0),
    "",
    "📚 بيانات الدراسة",
    "📖 المواد: "+subjects.length,
    "📦 الوحدات: "+units.length,
    "📝 الدروس: "+lessons.length,
    "✅ الدروس المكتملة: "+completedLessons,
    "⏱️ وقت الجلسات: "+Math.round(focusSeconds/60).toLocaleString("ar-EG")+" دقيقة",
    "🎯 وضع التركيز: "+(appData?.focusSubjectId?String(appData.focusSubjectId):"بدون مادة محددة"),
    "",
    "⚙️ الإعدادات",
    "🌐 اللغة: "+String(settings?.language||"غير محددة"),
    "🕐 مدة الجلسة: "+String(settings?.focus||settings?.study||"غير محددة"),
    "☁️ حجم بيانات الحساب: "+(data?Number(data.size||0).toLocaleString("ar-EG")+" بايت":"لا توجد"),
    "🕐 آخر حفظ للبيانات: "+(data?.updated_at?adminFormatDate(data.updated_at):"—"),
    "",
    "🔒 ملاحظة: كلمات السر وpassword hashes لا يتم عرضها."
  ].join("\n");
  await telegramCall(env,"sendMessage",{chat_id:chatId,text,reply_markup:adminUserKeyboard(String(u.id))});
}
async function sendTelegramUserActionConfirm(env:Env,chatId:string,userId:string,action:"delete"){
  const u=await env.DB.prepare("SELECT name,email FROM users WHERE id=?").bind(userId).first<any>();
  if(!u){await sendTelegramDashboard(env,chatId);return;}
  await telegramCall(env,"sendMessage",{chat_id:chatId,text:(action==="delete"?"⚠️ حذف حساب المستخدم\n\n":"")+
    "👤 "+String(u.name||"—")+"\n✉️ "+String(u.email||"—")+"\n\n"+
    "هذا الإجراء لا يمكن التراجع عنه. هل أنت متأكد؟",
    reply_markup:{inline_keyboard:[
      [{text:"🗑️ نعم، احذف الحساب",callback_data:"user_delete_confirm:"+userId}],
      [{text:"❌ إلغاء",callback_data:"user_view:"+userId}]
    ]}});
}
async function logoutUserSessions(env:Env,chatId:string,userId:string){
  const r=await env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(userId).run();
  await telegramCall(env,"sendMessage",{chat_id:chatId,text:"🚪 تم إنهاء جلسات المستخدم بالكامل.\n\n🧹 الجلسات المحذوفة: "+Number(r.meta?.changes||0),reply_markup:{inline_keyboard:[[ {text:"👤 فتح الملف",callback_data:"user_view:"+userId} ],[ {text:"🎛️ اللوحة",callback_data:"dash_home"} ]] }});
}
async function deleteUser(env:Env,chatId:string,userId:string){
  const u=await env.DB.prepare("SELECT name,email FROM users WHERE id=?").bind(userId).first<any>();
  if(!u){await sendTelegramDashboard(env,chatId);return;}
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(userId),
    env.DB.prepare("DELETE FROM auth_codes WHERE email=?").bind(String(u.email||"")),
    env.DB.prepare("DELETE FROM user_phones WHERE user_id=?").bind(userId),
    env.DB.prepare("DELETE FROM user_data WHERE user_id=?").bind(userId),
    env.DB.prepare("DELETE FROM users WHERE id=?").bind(userId)
  ]);
  await adminLog(env,chatId,"DELETE_USER",userId,String(u.email||""));
  await telegramCall(env,"sendMessage",{chat_id:chatId,text:"🗑️ تم حذف الحساب نهائيًا.\n\n👤 "+String(u.name||"—")+"\n✉️ "+String(u.email||"—"),reply_markup:{inline_keyboard:[[ {text:"👥 المستخدمين",callback_data:"dash_users"} ],[ {text:"🎛️ اللوحة",callback_data:"dash_home"} ]] }});
}
async function sendTelegramTrafficDetailed(env:Env,chatId:string){
  await ensurePageViews(env);
  const today=new Date().toISOString().slice(0,10);
  const rows=await env.DB.prepare("SELECT day,COUNT(*) AS n FROM site_page_views WHERE day>=date(?, '-29 day') GROUP BY day ORDER BY day DESC").bind(today).all<any>();
  const items=rows.results||[];
  const total=items.reduce((a:any,x:any)=>a+Number(x.n||0),0);
  const todayRow=items.find((x:any)=>String(x.day)===today);
  const peak=items.reduce((a:any,x:any)=>Number(x.n||0)>Number(a?.n||0)?x:a,null);
  const text=["📈 تحليلات الزيارات — 30 يومًا","",
    "👀 إجمالي الفترة: "+total.toLocaleString("ar-EG"),
    "📅 اليوم: "+Number(todayRow?.n||0).toLocaleString("ar-EG"),
    "🔥 أعلى يوم: "+(peak?String(peak.day)+" — "+Number(peak.n||0).toLocaleString("ar-EG")+" زيارة":"—"),
    "","آخر الأيام:",...items.slice(0,14).map((x:any)=>"• "+String(x.day)+" — "+Number(x.n||0).toLocaleString("ar-EG"))
  ].join("\n");
  await telegramCall(env,"sendMessage",{chat_id:chatId,text,reply_markup:dashBack()});
}
async function sendTelegramMaintenanceTools(env:Env,chatId:string){
  const expiredSessions=await env.DB.prepare("SELECT COUNT(*) AS n FROM sessions WHERE expires_at<=?").bind(Date.now()).first<any>();
  const expiredCodes=await env.DB.prepare("SELECT COUNT(*) AS n FROM auth_codes WHERE expires_at<=?").bind(Date.now()).first<any>();
  const text=["🧰 أدوات الإدارة والصيانة","",
    "🧹 جلسات منتهية يمكن تنظيفها: "+Number(expiredSessions?.n||0),
    "🧹 أكواد OTP منتهية يمكن تنظيفها: "+Number(expiredCodes?.n||0),
    "","الأدوات الآمنة المتاحة من هنا:"
  ].join("\n");
  await telegramCall(env,"sendMessage",{chat_id:chatId,text,reply_markup:{inline_keyboard:[
    [{text:"🧹 تنظيف البيانات المنتهية",callback_data:"dash_cleanup"}],
    [{text:"🔄 فحص النظام",callback_data:"dash_system"}],
    [{text:"⬅️ اللوحة",callback_data:"dash_home"}]
  ]}});
}
async function cleanupAdminData(env:Env,chatId:string){
  const now=Date.now();
  const a=await env.DB.prepare("DELETE FROM sessions WHERE expires_at<=?").bind(now).run();
  const b=await env.DB.prepare("DELETE FROM auth_codes WHERE expires_at<=?").bind(now).run();
  await telegramCall(env,"sendMessage",{chat_id:chatId,text:"🧹 تم التنظيف بنجاح\n\n🚪 جلسات محذوفة: "+Number(a.meta?.changes||0)+"\n🔐 أكواد OTP محذوفة: "+Number(b.meta?.changes||0),reply_markup:{inline_keyboard:[[ {text:"🧰 أدوات الإدارة",callback_data:"dash_tools"} ],[ {text:"🎛️ اللوحة",callback_data:"dash_home"} ]] }});
}
async function ensureAdminTools(env:Env){
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS admin_settings (key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at INTEGER NOT NULL)").run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS admin_activity (id INTEGER PRIMARY KEY AUTOINCREMENT,chat_id TEXT NOT NULL,action TEXT NOT NULL,target TEXT,message TEXT,created_at INTEGER NOT NULL)").run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_admin_activity_created ON admin_activity(created_at)").run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS user_activity (user_id TEXT PRIMARY KEY,last_seen INTEGER NOT NULL,last_path TEXT NOT NULL,last_method TEXT NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)").run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_user_activity_seen ON user_activity(last_seen)").run();
}
async function adminLog(env:Env,chatId:string,action:string,target="",message=""){
  await ensureAdminTools(env);
  await env.DB.prepare("INSERT INTO admin_activity(chat_id,action,target,message,created_at) VALUES(?,?,?,?,?)").bind(chatId,action,target,message.slice(0,1000),Date.now()).run();
}
async function touchUserActivity(env:Env,userId:string,path:string,method:string){
  try{
    await ensureAdminTools(env);
    await env.DB.prepare("INSERT INTO user_activity(user_id,last_seen,last_path,last_method) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET last_seen=excluded.last_seen,last_path=excluded.last_path,last_method=excluded.last_method")
      .bind(userId,Date.now(),path.slice(0,160),method.slice(0,12)).run();
  }catch(e){ console.error("User activity tracking failed",e); }
}
async function sendAdminAlert(env:Env,title:string,message:string,key="",cooldownMs=0){
  try{
    if(key&&cooldownMs>0){
      const last=Number(await getAdminSetting(env,"alert_last_"+key,"0")||0);
      if(Date.now()-last<cooldownMs)return;
      await setAdminSetting(env,"alert_last_"+key,String(Date.now()));
    }
    await telegramCall(env,"sendMessage",{
      chat_id:env.TELEGRAM_CHAT_ID,
      text:["🚨 تنبيه إدارة Thanaweya","",title,message,"","🕐 "+new Date().toLocaleString("ar-EG")].join("\n"),
      reply_markup:{inline_keyboard:[
        [{text:"🚨 مركز التنبيهات",callback_data:"dash_alerts"}],
        [{text:"🎛️ لوحة التحكم",callback_data:"dash_home"}]
      ]}
    });
  }catch(e){ console.error("Admin alert delivery failed",e); }
}
async function getAdminSetting(env:Env,key:string,defaultValue=""){
  await ensureAdminTools(env);
  const r=await env.DB.prepare("SELECT value FROM admin_settings WHERE key=?").bind(key).first<any>();
  return r?.value===undefined?defaultValue:String(r.value);
}
async function setAdminSetting(env:Env,key:string,value:string){
  await ensureAdminTools(env);
  await env.DB.prepare("INSERT INTO admin_settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(key,value,Date.now()).run();
}
async function getSiteAnnouncement(env:Env){
  const raw=await getAdminSetting(env,"site_announcement","");
  if(!raw)return null;
  try{return JSON.parse(raw)}catch{return null}
}
async function saveSiteAnnouncement(env:Env,a:any){
  await setAdminSetting(env,"site_announcement",JSON.stringify(a));
}
async function sendTelegramAnnouncements(env:Env,chatId:string){
  const a=await getSiteAnnouncement(env);
  const typeLabel=a?.type==="first"?"👋 أول دخول":a?.type==="temporary"?"⏱️ مؤقت":"📌 ثابت";
  const placeLabel=a?.placement==="center"?"🎯 وسط الصفحة":a?.placement==="modal"?"🚨 Popup كبير":"⬆️ أعلى الصفحة";
  const status=a?.enabled?"🟢 شغال":"🔴 متوقف";
  const text=a
    ?["📢 إعلان الموقع","",
      "📌 العنوان: "+String(a.title||"—"),
      "📝 الرسالة: "+String(a.message||"—"),
      "📍 المكان: "+placeLabel,
      "📦 النوع: "+typeLabel,
      a.durationSec?"⏱️ مدة الـPopup: "+Number(a.durationSec)+" ثواني":"",
      a.buttonText?"🔘 الزر: "+String(a.buttonText):"🔘 بدون زر",
      status,
      a.expiresAt?"⏳ ينتهي: "+adminFormatDate(a.expiresAt):""
    ].filter(Boolean).join("\n")
    : "📢 إعلان الموقع\n\nلا يوجد إعلان حاليًا.";
  const buttons=[
    [{text:"➕ إضافة/تعديل إعلان",callback_data:"announcement_add"}],
    ...(a?[
      [{text:a.enabled?"🔴 إيقاف الإعلان":"🟢 تشغيل الإعلان",callback_data:"announcement_toggle"},{text:"🗑️ حذف الإعلان",callback_data:"announcement_delete"}]
    ]:[]),
    [{text:"⬅️ أدوات الإدارة",callback_data:"dash_tools"}]
  ];
  await telegramCall(env,"sendMessage",{chat_id:chatId,text,reply_markup:{inline_keyboard:buttons}});
}
async function deleteSiteAnnouncement(env:Env,chatId:string){
  await setAdminSetting(env,"site_announcement","");
  await adminLog(env,chatId,"DELETE_SITE_ANNOUNCEMENT");
  await sendTelegramAnnouncements(env,chatId);
}
async function toggleSiteAnnouncement(env:Env,chatId:string){
  const a=await getSiteAnnouncement(env);
  if(!a){await sendTelegramAnnouncements(env,chatId);return;}
  a.enabled=!a.enabled;
  await saveSiteAnnouncement(env,a);
  await adminLog(env,chatId,a.enabled?"ENABLE_SITE_ANNOUNCEMENT":"DISABLE_SITE_ANNOUNCEMENT");
  await sendTelegramAnnouncements(env,chatId);
}
async function createSiteAnnouncement(env:Env,chatId:string,payload:any){
  const type=String(payload?.type||"fixed");
  const placement=payload?.placement==="center"||payload?.placement==="modal"?payload.placement:"top";
  const hours=type==="temporary"?Math.max(1,Math.min(720,Number(payload?.hours)||24)):null;
  const durationSec=placement==="modal"?Math.max(1,Math.min(60,Number(payload?.durationSec)||5)):0;
  const a={
    id:randomHex(12),
    title:String(payload?.title||"").trim().slice(0,120),
    message:String(payload?.message||"").trim().slice(0,2000),
    type:type==="first"||type==="temporary"?"fixed"===type?"fixed":type:"fixed",
    placement,
    durationSec,
    buttonText:String(payload?.buttonText||"").trim().slice(0,50),
    buttonUrl:String(payload?.buttonUrl||"").trim().slice(0,500),
    enabled:true,
    createdAt:Date.now(),
    expiresAt:type==="temporary"?Date.now()+Number(hours||0)*3600000:null
  };
  if(!a.title||!a.message)throw new Error("عنوان ورسالة الإعلان مطلوبان");
  if(a.buttonText&&!/^https?:\/\//i.test(a.buttonUrl)) throw new Error("رابط الزر يجب أن يبدأ بـ https:// أو http://");
  await saveSiteAnnouncement(env,a);
  await adminLog(env,chatId,"SAVE_SITE_ANNOUNCEMENT",a.type,a.title+" | "+a.placement);
  await clearTelegramAdminMode(env,chatId);
  await sendTelegramAnnouncements(env,chatId);
}
async function sendTelegramAdminTools(env:Env,chatId:string){
  const maintenance=await getAdminSetting(env,"maintenance","0");
  const activity=await env.DB.prepare("SELECT action,target,created_at FROM admin_activity ORDER BY created_at DESC LIMIT 8").all<any>();
  const lines=(activity.results||[]).map((x:any)=>"• "+String(x.action)+" "+(x.target?"— "+String(x.target).slice(0,30):"")+" · "+adminFormatDate(x.created_at));
  const text=["🛠️ مركز تحكم الأدمن","",
    "🚦 وضع الصيانة: "+(maintenance==="1"?"🔴 مفعّل":"🟢 متوقف"),
    "🧾 آخر العمليات:",...(lines.length?lines:["لا توجد عمليات مسجلة."])
  ].join("\n");
  await telegramCall(env,"sendMessage",{chat_id:chatId,text,reply_markup:{inline_keyboard:[
    [{text:maintenance==="1"?"🟢 إيقاف الصيانة":"🔴 تفعيل الصيانة",callback_data:"admin_maintenance"}],
    [{text:"📢 إعلانات الموقع",callback_data:"admin_announcements"}],
    [{text:"🧾 سجل العمليات",callback_data:"admin_activity"},{text:"📋 تقرير شامل",callback_data:"admin_report"}],
    [{text:"📢 رسالة واتساب",callback_data:"dash_broadcast"},{text:"📧 رسالة Gmail",callback_data:"dash_email_broadcast"}],
    [{text:"⬅️ اللوحة",callback_data:"dash_home"}]
  ]}});
}
async function sendTelegramAdminActivity(env:Env,chatId:string){
  const rows=await env.DB.prepare("SELECT action,target,message,created_at FROM admin_activity ORDER BY created_at DESC LIMIT 25").all<any>();
  const lines=(rows.results||[]).map((x:any,i:number)=>(i+1)+". "+String(x.action)+" "+(x.target?"— "+String(x.target):"")+
    "\n   🕐 "+adminFormatDate(x.created_at)+(x.message?"\n   📝 "+String(x.message).slice(0,120):""));
  await telegramCall(env,"sendMessage",{chat_id:chatId,text:["🧾 سجل عمليات الأدمن","",...(lines.length?lines:["لا يوجد سجل."])].join("\n"),reply_markup:dashBack()});
}
async function sendTelegramAdminReport(env:Env,chatId:string){
  const s=await getPageViewStats(env);
  const verified=await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE email_verified_at IS NOT NULL").first<any>();
  const phones=await env.DB.prepare("SELECT COUNT(*) AS n FROM user_phones WHERE phone IS NOT NULL AND phone<>''").first<any>();
  const active=await env.DB.prepare("SELECT COUNT(*) AS n FROM sessions WHERE expires_at>?").bind(Date.now()).first<any>();
  const new24=await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE created_at>=?").bind(Date.now()-86400000).first<any>();
  const wa=await env.DB.prepare("SELECT COUNT(*) AS n FROM whatsapp_messages WHERE created_at>=?").bind(Date.now()-86400000).first<any>();
  const failed=await env.DB.prepare("SELECT COUNT(*) AS n FROM whatsapp_messages WHERE status='failed' AND created_at>=?").bind(Date.now()-86400000).first<any>();
  const maintenance=await getAdminSetting(env,"maintenance","0");
  const text=["📋 التقرير الشامل","",
    "👥 المستخدمون: "+s.totalUsers,
    "🆕 تسجيلات 24 ساعة: "+Number(new24?.n||0),
    "✅ حسابات مؤكدة: "+Number(verified?.n||0),
    "📱 أرقام واتساب: "+Number(phones?.n||0),
    "🟢 جلسات فعالة: "+Number(active?.n||0),
    "👀 زيارات اليوم: "+s.todayVisits,
    "🗓️ زيارات 7 أيام: "+s.last7DaysVisits,
    "📨 رسائل واتساب 24 ساعة: "+Number(wa?.n||0),
    "❌ فشل واتساب 24 ساعة: "+Number(failed?.n||0),
    "🚦 الصيانة: "+(maintenance==="1"?"🔴 مفعلة":"🟢 متوقفة"),
    "",
    "🕐 "+new Date().toLocaleString("ar-EG")
  ].join("\n");
  await adminLog(env,chatId,"VIEW_REPORT");
  await telegramCall(env,"sendMessage",{chat_id:chatId,text,reply_markup:dashBack()});
}
async function toggleMaintenance(env:Env,chatId:string){
  const current=await getAdminSetting(env,"maintenance","0");
  const next=current==="1"?"0":"1";
  await setAdminSetting(env,"maintenance",next);
  await adminLog(env,chatId,next==="1"?"ENABLE_MAINTENANCE":"DISABLE_MAINTENANCE");
  await telegramCall(env,"sendMessage",{chat_id:chatId,text:next==="1"?"🔴 تم تفعيل وضع الصيانة.":"🟢 تم إيقاف وضع الصيانة.",reply_markup:{inline_keyboard:[[ {text:"🛠️ مركز التحكم",callback_data:"dash_tools"} ]] }});
}
async function sendTelegramCommandCenter(env:Env,chatId:string){
  const s=await getPageViewStats(env);
  const active=await env.DB.prepare("SELECT COUNT(*) AS n FROM sessions WHERE expires_at>?").bind(Date.now()).first<any>();
  const new24=await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE created_at>=?").bind(Date.now()-86400000).first<any>();
  const verified=await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE email_verified_at IS NOT NULL").first<any>();
  const wa=await env.DB.prepare("SELECT COUNT(*) AS n FROM user_phones WHERE phone IS NOT NULL AND phone<>''").first<any>();
  const failures=await env.DB.prepare("SELECT COUNT(*) AS n FROM whatsapp_messages WHERE status='failed' AND created_at>=?").bind(Date.now()-86400000).first<any>().catch(()=>({n:0}));
  const text=[
    "⚡ مركز القيادة — Thanaweya","",
    "🟢 الآن: "+Number(active?.n||0)+" جلسة فعالة",
    "👥 المستخدمون: "+s.totalUsers,
    "🆕 تسجيلات 24س: "+Number(new24?.n||0),
    "👀 زيارات اليوم: "+s.todayVisits,
    "📱 واتساب مرتبط: "+Number(wa?.n||0),
    "❌ فشل واتساب 24س: "+Number(failures?.n||0),
    "✅ حسابات مؤكدة: "+Number(verified?.n||0),
    "",
    "اختر مركز التحكم:",
  ].join("\n");
  await telegramCall(env,"sendMessage",{chat_id:chatId,text,reply_markup:{inline_keyboard:[
    [{text:"🟢 نشاط المستخدمين",callback_data:"dash_live"},{text:"📈 النمو",callback_data:"dash_growth"}],
    [{text:"🛡️ الأمان",callback_data:"dash_security"},{text:"📚 البيانات",callback_data:"dash_data"}],
    [{text:"🧾 Audit Log",callback_data:"admin_activity"},{text:"🚨 التنبيهات",callback_data:"dash_alerts"}],
    [{text:"📢 الحملات",callback_data:"dash_campaigns"},{text:"📣 الإعلانات",callback_data:"admin_announcements"}],
    [{text:"🩺 النظام",callback_data:"dash_system"},{text:"🧰 الصيانة",callback_data:"dash_tools"}],
    [{text:"⬅️ لوحة التحكم",callback_data:"dash_home"}]
  ]}});
}
async function sendTelegramLive(env:Env,chatId:string){
  const cutoff=Date.now()-5*60*1000;
  const active=await env.DB.prepare("SELECT COUNT(*) AS n FROM user_activity WHERE last_seen>=?").bind(cutoff).first<any>();
  const recent=await env.DB.prepare("SELECT u.id,u.name,u.email,a.last_seen,a.last_path FROM user_activity a JOIN users u ON u.id=a.user_id WHERE a.last_seen>=? ORDER BY a.last_seen DESC LIMIT 10").bind(cutoff).all<any>();
  const signups=await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE created_at>=?").bind(Date.now()-86400000).first<any>();
  const lines=(recent.results||[]).map((u:any,i:number)=>
    (i+1)+". 👤 "+String(u.name||"—")+"\n   ✉️ "+String(u.email||"—")+"\n   🕐 "+adminFormatDate(u.last_seen)+"\n   📍 "+String(u.last_path||"/")
  );
  const text=["🟢 نشاط المستخدمين — Live","",
    "🟢 متواجدون خلال آخر 5 دقائق: "+Number(active?.n||0),
    "🆕 تسجيلات آخر 24 ساعة: "+Number(signups?.n||0),
    "",
    ...(lines.length?lines:["لا يوجد مستخدم نشط حاليًا."]),
    "",
    "ℹ️ النشاط يتحدث تلقائيًا أثناء استخدام الموقع.",
    "🔄 اضغط تحديث لرؤية الحالة الحالية."
  ].join("\n");
  await telegramCall(env,"sendMessage",{chat_id:chatId,text,reply_markup:{inline_keyboard:[
    [{text:"🔄 تحديث Live",callback_data:"dash_live"}],
    [{text:"⬅️ مركز القيادة",callback_data:"dash_center"}]
  ]}});
}
async function sendTelegramGrowth(env:Env,chatId:string){
  const now=Date.now();
  const periods=[1,7,30].map(days=>({days,start:now-days*86400000}));
  const vals=[];
  for(const p of periods){
    const u=await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE created_at>=?").bind(p.start).first<any>();
    vals.push("• آخر "+p.days+" يوم: "+Number(u?.n||0)+" تسجيل");
  }
  const text=["📈 Growth Center","",...vals,
    "👀 زيارات 7 أيام: "+(await getPageViewStats(env)).last7DaysVisits,
    "","💡 استخدم تحليلات 30 يوم للتفاصيل."
  ].join("\n");
  await telegramCall(env,"sendMessage",{chat_id:chatId,text,reply_markup:{inline_keyboard:[
    [{text:"📊 تحليلات 30 يوم",callback_data:"dash_traffic30"}],
    [{text:"⬅️ مركز القيادة",callback_data:"dash_center"}]
  ]}});
}
async function sendTelegramSecurity(env:Env,chatId:string){
  const active=await env.DB.prepare("SELECT COUNT(*) AS n FROM sessions WHERE expires_at>?").bind(Date.now()).first<any>();
  const expired=await env.DB.prepare("SELECT COUNT(*) AS n FROM sessions WHERE expires_at<=?").bind(Date.now()).first<any>();
  const codes=await env.DB.prepare("SELECT COUNT(*) AS n FROM auth_codes WHERE expires_at>?").bind(Date.now()).first<any>();
  const text=["🛡️ Security Center","",
    "🟢 جلسات فعالة: "+Number(active?.n||0),
    "🧹 جلسات منتهية: "+Number(expired?.n||0),
    "🔐 أكواد OTP فعالة: "+Number(codes?.n||0),
    "🔒 حماية لوحة الأدمن: مرتبطة بـ Telegram Chat ID",
    "","🧹 يمكنك تنظيف البيانات المنتهية من أدوات الإدارة."
  ].join("\n");
  await telegramCall(env,"sendMessage",{chat_id:chatId,text,reply_markup:{inline_keyboard:[
    [{text:"🧹 تنظيف",callback_data:"dash_cleanup"},{text:"🔐 إحصائيات الدخول",callback_data:"dash_auth"}],
    [{text:"⬅️ مركز القيادة",callback_data:"dash_center"}]
  ]}});
}
async function sendTelegramDataCenter(env:Env,chatId:string){
  const users=await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first<any>();
  const data=await env.DB.prepare("SELECT COUNT(*) AS n FROM user_data").first<any>();
  const phones=await env.DB.prepare("SELECT COUNT(*) AS n FROM user_phones").first<any>();
  const views=await env.DB.prepare("SELECT COUNT(*) AS n FROM site_page_views").first<any>();
  const text=["📚 Data Center","",
    "👥 Users: "+Number(users?.n||0),
    "☁️ ملفات بيانات الحسابات: "+Number(data?.n||0),
    "📱 أرقام واتساب: "+Number(phones?.n||0),
    "👀 سجلات الزيارات: "+Number(views?.n||0),
    "","البيانات الأساسية تعمل من D1."
  ].join("\n");
  await telegramCall(env,"sendMessage",{chat_id:chatId,text,reply_markup:{inline_keyboard:[
    [{text:"👥 المستخدمين",callback_data:"dash_users"},{text:"📱 واتساب",callback_data:"dash_wa"}],
    [{text:"⬅️ مركز القيادة",callback_data:"dash_center"}]
  ]}});
}
async function sendTelegramAlerts(env:Env,chatId:string){
  const failed=await env.DB.prepare("SELECT COUNT(*) AS n FROM whatsapp_messages WHERE status='failed' AND created_at>=?").bind(Date.now()-86400000).first<any>().catch(()=>({n:0}));
  const expired=await env.DB.prepare("SELECT COUNT(*) AS n FROM auth_codes WHERE expires_at<=?").bind(Date.now()).first<any>();
  const maintenance=await getAdminSetting(env,"maintenance","0");
  const alerts=[];
  if(Number(failed?.n||0)>0) alerts.push("❌ فشل واتساب آخر 24س: "+Number(failed.n));
  if(Number(expired?.n||0)>20) alerts.push("⚠️ أكواد OTP منتهية: "+Number(expired.n));
  if(maintenance==="1") alerts.push("🔴 وضع الصيانة مفعّل");
  const text=["🚨 Smart Alerts","",...(alerts.length?alerts:["✅ لا توجد تنبيهات حرجة حاليًا."]),"","🔄 الفحص مبني على بيانات الموقع الحالية."].join("\n");
  await telegramCall(env,"sendMessage",{chat_id:chatId,text,reply_markup:{inline_keyboard:[
    [{text:"🔄 إعادة الفحص",callback_data:"dash_alerts"}],
    [{text:"⬅️ مركز القيادة",callback_data:"dash_center"}]
  ]}});
}
async function sendTelegramCampaigns(env:Env,chatId:string){
  const wa=await env.DB.prepare("SELECT COUNT(*) AS n FROM whatsapp_messages WHERE created_at>=?").bind(Date.now()-86400000).first<any>().catch(()=>({n:0}));
  const email=await env.DB.prepare("SELECT COUNT(*) AS n FROM admin_activity WHERE action='EMAIL_BROADCAST' AND created_at>=?").bind(Date.now()-86400000).first<any>();
  const text=["📢 Campaign Center","",
    "📱 حملات واتساب آخر 24س: "+Number(wa?.n||0),
    "📧 حملات Gmail آخر 24س: "+Number(email?.n||0),
    "","اختار قناة الإرسال:"
  ].join("\n");
  await telegramCall(env,"sendMessage",{chat_id:chatId,text,reply_markup:{inline_keyboard:[
    [{text:"📱 إرسال واتساب",callback_data:"dash_broadcast"}],
    [{text:"📧 إرسال Gmail",callback_data:"dash_email_broadcast"}],
    [{text:"📢 إعلانات الموقع",callback_data:"admin_announcements"}],
    [{text:"⬅️ مركز القيادة",callback_data:"dash_center"}]
  ]}});
}
async function ensureGlobalLectures(env:Env){
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS global_lectures (id TEXT PRIMARY KEY,title TEXT NOT NULL,subject_name TEXT NOT NULL,url TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',kind TEXT NOT NULL DEFAULT 'link',enabled INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)").run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_global_lectures_subject ON global_lectures(subject_name,enabled)").run();
}
async function getGlobalLectures(env:Env){
  await ensureGlobalLectures(env);
  const rows=await env.DB.prepare("SELECT id,title,subject_name,url,description,kind,created_at,updated_at FROM global_lectures WHERE enabled=1 ORDER BY subject_name ASC,created_at DESC").all<any>();
  return rows.results||[];
}
async function sendTelegramGlobalLectures(env:Env,chatId:string){
  const rows=await env.DB.prepare("SELECT id,title,subject_name,url,description,created_at FROM global_lectures WHERE enabled=1 ORDER BY subject_name ASC,created_at DESC").all<any>();
  const items=rows.results||[];
  const lines=items.map((x:any,i:number)=>(i+1)+". 📚 "+String(x.title)+"\n   المادة: "+String(x.subject_name)+"\n   🔗 "+String(x.url));
  const buttons=items.slice(0,20).map((x:any)=>[{text:"🗑️ حذف: "+String(x.title).slice(0,25),callback_data:"global_lecture_delete:"+String(x.id)}]);
  await telegramCall(env,"sendMessage",{chat_id:chatId,text:["📚 مصادر المحاضرات العامة","","هذه المصادر ثابتة وتظهر لكل المستخدمين.","",...(lines.length?lines:["لا توجد مصادر عامة حتى الآن."])].join("\n"),reply_markup:{inline_keyboard:[[{text:"➕ إضافة مصدر",callback_data:"global_lecture_add"}],...buttons,[{text:"⬅️ لوحة التحكم",callback_data:"dash_home"}]]}});
}
async function createGlobalLecture(env:Env,chatId:string,payload:any){
  await ensureGlobalLectures(env);
  const title=String(payload?.title||"").trim().slice(0,160);
  const subject=String(payload?.subject_name||"").trim().slice(0,100);
  const url=String(payload?.url||"").trim().slice(0,1000);
  if(!title||!subject||!/^https?:\/\//i.test(url)){await telegramCall(env,"sendMessage",{chat_id:chatId,text:"❌ البيانات غير مكتملة أو الرابط غير صحيح."});return;}
  const now=Date.now();
  await env.DB.prepare("INSERT INTO global_lectures(id,title,subject_name,url,description,kind,enabled,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)").bind(randomHex(16),title,subject,url,"","link",1,now,now).run();
  await clearTelegramAdminMode(env,chatId);
  await telegramCall(env,"sendMessage",{chat_id:chatId,text:"✅ تم إضافة المصدر العام.\n\n📚 "+title+"\n📖 المادة: "+subject+"\n🔗 "+url+"\n\nسيظهر الآن لكل المستخدمين داخل قسم المحاضرات.",reply_markup:{inline_keyboard:[[{text:"📚 مصادر المحاضرات",callback_data:"dash_global_lectures"}],[{text:"🎛️ لوحة التحكم",callback_data:"dash_home"}]]}});
}
async function ensureGlobalNotifications(env:Env){
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS global_notifications (id TEXT PRIMARY KEY,title TEXT NOT NULL,message TEXT NOT NULL,type TEXT NOT NULL DEFAULT 'info',enabled INTEGER NOT NULL DEFAULT 1,expires_at INTEGER,created_at INTEGER NOT NULL)").run();
}
async function sendTelegramGlobalNotifications(env:Env,chatId:string){
  await ensureGlobalNotifications(env);
  await ensurePushSubscriptions(env);
  const devices=await env.DB.prepare("SELECT COUNT(*) AS n FROM push_subscriptions").first<any>();
  const rows=await env.DB.prepare("SELECT id,title,message,type,created_at FROM global_notifications ORDER BY created_at DESC LIMIT 10").all<any>();
  const items=rows.results||[];
  const lines=items.map((x:any,i:number)=>{
    const icon=x.type==="urgent"?"🚨":x.type==="success"?"✅":x.type==="warning"?"⚠️":"📢";
    return (i+1)+". "+icon+" "+String(x.title)+"\n   "+String(x.message).slice(0,220);
  });
  const text=[
    "📲 مركز إشعارات الأجهزة",
    "",
    "الإشعارات هنا Push حقيقية وتوصل للموبايل والتابلت والكمبيوتر بعد تفعيلها من المستخدم.",
    "",
    "📱 الأجهزة المفعّلة: "+Number(devices?.n||0).toLocaleString("ar-EG"),
    "",
    lines.length?"🕐 آخر الإشعارات:":"لا توجد إشعارات مرسلة حتى الآن.",
    ...lines
  ].join("\n");
  const keyboard=[
    [{text:"➕ إرسال Push جديد",callback_data:"global_notification_add"}],
    [{text:"🔄 تحديث",callback_data:"dash_global_notifications"}],
    [{text:"⬅️ لوحة التحكم",callback_data:"dash_home"}]
  ];
  await telegramCall(env,"sendMessage",{chat_id:chatId,text,reply_markup:{inline_keyboard:keyboard}});
}
async function createGlobalNotification(env:Env,chatId:string,payload:any){
  const title=String(payload?.title||"").trim().slice(0,140);
  const message=String(payload?.message||"").trim().slice(0,2000);
  const type="info";
  if(!title||!message){await telegramCall(env,"sendMessage",{chat_id:chatId,text:"❌ عنوان الإشعار ونصه مطلوبان."});return;}
  await clearTelegramAdminMode(env,chatId);
  try{
    const result=await broadcastWebPush(env,title,message,String(payload?.url||"/"));
    const now=Date.now();
    await ensureGlobalNotifications(env);
    await env.DB.prepare("INSERT INTO global_notifications(id,title,message,type,enabled,expires_at,created_at) VALUES(?,?,?,?,?,?,?)").bind(randomHex(16),title,message,type,1,null,now).run();
    await adminLog(env,chatId,"PUSH_BROADCAST","all",title+" — "+message);
    await telegramCall(env,"sendMessage",{chat_id:chatId,text:[
      "📲 تم تنفيذ إشعار Push",
      "",
      "📢 "+title,
      "👥 الأجهزة المستهدفة: "+result.total,
      "✅ وصل لمزود الإشعارات: "+result.sent,
      "❌ فشل: "+result.failed,
      "🧹 اشتراكات منتهية حُذفت: "+result.removed,
      result.errors.length?"\n⚠️ أمثلة أخطاء:\n"+result.errors.join("\n"):""
    ].join("\n"),reply_markup:{inline_keyboard:[
      [{text:"📲 مركز إشعارات الأجهزة",callback_data:"dash_global_notifications"}],
      [{text:"🎛️ لوحة التحكم",callback_data:"dash_home"}]
    ]}});
  }catch(e){
    await telegramCall(env,"sendMessage",{chat_id:chatId,text:"⚠️ تعذر إرسال Push:\n\n"+(e instanceof Error?e.message:String(e)).slice(0,700),reply_markup:{inline_keyboard:[
      [{text:"📲 مركز الإشعارات",callback_data:"dash_global_notifications"}],
      [{text:"🎛️ لوحة التحكم",callback_data:"dash_home"}]
    ]}});
  }
}
function telegramDashboardKeyboard(){
  return {inline_keyboard:[
    [{text:"⚡ مركز القيادة",callback_data:"dash_center"}],
    [{text:"📊 الرئيسية والإحصائيات",callback_data:"dash_stats"},{text:"🩺 حالة النظام",callback_data:"dash_system"}],
    [{text:"👥 المستخدمين",callback_data:"dash_users"},{text:"🔎 بحث عن مستخدم",callback_data:"dash_search"}],
    [{text:"🟢 نشاط المستخدمين",callback_data:"dash_live"},{text:"🕐 آخر المستخدمين",callback_data:"dash_recent"}],
    [{text:"📈 الزيارات",callback_data:"dash_traffic"},{text:"📊 تحليلات 30 يوم",callback_data:"dash_traffic30"}],
    [{text:"🔐 الدخول و OTP",callback_data:"dash_auth"},{text:"📱 واتساب",callback_data:"dash_wa"}],
    [{text:"🛠️ أدوات الإدارة",callback_data:"dash_tools"}],
    [{text:"📚 مصادر المحاضرات",callback_data:"dash_global_lectures"}],
    [{text:"📢 مركز الإشعارات",callback_data:"dash_global_notifications"}],
    [{text:"📢 إرسال واتساب",callback_data:"dash_broadcast"},{text:"📧 إرسال Gmail",callback_data:"dash_email_broadcast"}],
    [{text:"🔄 تحديث اللوحة",callback_data:"dash_home"}]
  ]};
}
const dashBack=()=>({inline_keyboard:[
  [{text:"⚡ مركز القيادة",callback_data:"dash_center"}],
  [{text:"⬅️ لوحة التحكم",callback_data:"dash_home"}]
]});

async function sendTelegramDashboard(env:Env,chatId:string){
  const stats=await getPageViewStats(env);
  let linked=0;
  try { const r=await env.DB.prepare("SELECT COUNT(*) AS n FROM user_phones WHERE phone IS NOT NULL AND phone<>''").first<any>(); linked=Number(r?.n||0); } catch {}
  const text=[
    "🎛️ لوحة تحكم ثانوية — الإدارة",
    "",
    "👥 الحسابات: "+stats.totalUsers.toLocaleString("ar-EG"),
    "📱 أرقام واتساب المرتبطة: "+linked.toLocaleString("ar-EG"),
    "👀 إجمالي الزيارات: "+stats.totalVisits.toLocaleString("ar-EG"),
    "📅 زيارات اليوم: "+stats.todayVisits.toLocaleString("ar-EG"),
    "🗓️ زيارات آخر 7 أيام: "+stats.last7DaysVisits.toLocaleString("ar-EG"),
    "",
    "اختار القسم اللي عايز تديره 👇"
  ].join("\n");
  await telegramCall(env,"sendMessage",{chat_id:chatId,text,reply_markup:telegramDashboardKeyboard()});
}

async function sendTelegramUsers(env:Env,chatId:string,page=1){
  const pageSize=10;
  const totalRow=await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first<any>();
  const total=Number(totalRow?.n||0);
  const pages=Math.max(1,Math.ceil(total/pageSize));
  const current=Math.min(Math.max(1,Math.floor(Number(page)||1)),pages);
  const offset=(current-1)*pageSize;
  const rows=await env.DB.prepare("SELECT u.id,u.name,u.email,u.email_verified_at,u.created_at,u.updated_at,p.phone FROM users u LEFT JOIN user_phones p ON p.user_id=u.id ORDER BY u.created_at DESC LIMIT ? OFFSET ?").bind(pageSize,offset).all<any>();
  const items=rows.results||[];
  const lines=items.map((u:any,i:number)=>{
    const verified=u.email_verified_at?"✅":"⏳";
    return [
      (offset+i+1)+". 👤 "+String(u.name||"بدون اسم")+" "+verified,
      "   ✉️ "+String(u.email||"—"),
      "   📱 "+String(u.phone||"غير مرتبط"),
      "   🕐 "+adminFormatDate(u.created_at)
    ].join("\n");
  });
  const buttons=items.map((u:any)=>[{text:"👤 "+String(u.name||"بدون اسم").slice(0,28),callback_data:"user_view:"+String(u.id)}]);
  const nav:any[]=[];
  if(current>1) nav.push({text:"⬅️ السابق",callback_data:"users_page:"+(current-1)});
  nav.push({text:"📄 "+current+" / "+pages,callback_data:"users_page:"+current});
  if(current<pages) nav.push({text:"التالي ➡️",callback_data:"users_page:"+(current+1)});
  const text=[
    "👥 جميع المستخدمين",
    "",
    "📊 إجمالي الحسابات: "+total.toLocaleString("ar-EG"),
    "📄 الصفحة: "+current+" من "+pages,
    "👤 المعروض الآن: "+items.length,
    "",
    ...(lines.length?lines:["لا يوجد مستخدمون حتى الآن."]),
    "",
    "اضغط على أي مستخدم لفتح ملفه الكامل."
  ].join("\n");
  await telegramCall(env,"sendMessage",{chat_id:chatId,text,reply_markup:{inline_keyboard:[...buttons,nav,[{text:"⬅️ لوحة التحكم",callback_data:"dash_home"}]]}});
}

async function sendTelegramRecentUsers(env:Env,chatId:string){
  const rows=await env.DB.prepare("SELECT u.id,u.name,u.email,p.phone,u.email_verified_at,u.created_at,u.updated_at FROM users u LEFT JOIN user_phones p ON p.user_id=u.id ORDER BY u.created_at DESC LIMIT 10").all<any>();
  const items=rows.results||[];
  const lines=items.map((u:any,i:number)=>{
    const created=new Date(Number(u.created_at||0)).toLocaleString("ar-EG",{dateStyle:"short",timeStyle:"short"});
    const verified=u.email_verified_at?"✅":"⏳";
    return (i+1)+". "+String(u.name||"بدون اسم")+" "+verified+
      "\n   ✉️ "+String(u.email||"")+
      "\n   📱 "+String(u.phone||"—")+
      "\n   🕐 "+created;
  });
  const buttons=items.slice(0,10).map((u:any,i:number)=>[{text:"👤 "+String(u.name||"بدون اسم").slice(0,24),callback_data:"user_view:"+String(u.id)}]);
  const text=["🕐 آخر 10 حسابات", "", ...(lines.length?lines:["لا يوجد مستخدمون حتى الآن."])].join("\n");
  await telegramCall(env,"sendMessage",{chat_id:chatId,text,reply_markup:{inline_keyboard:[...buttons,[{text:"⬅️ رجوع للوحة",callback_data:"dash_home"}]]}});
}

async function sendTelegramUserSearch(env:Env,chatId:string,query:string){
  const q="%"+query.trim().slice(0,80)+"%";
  const rows=await env.DB.prepare("SELECT u.id,u.name,u.email,p.phone,u.email_verified_at,u.created_at FROM users u LEFT JOIN user_phones p ON p.user_id=u.id WHERE u.name LIKE ? OR u.email LIKE ? OR COALESCE(p.phone,'') LIKE ? ORDER BY u.created_at DESC LIMIT 10").bind(q,q,q).all<any>();
  const items=rows.results||[];
  const lines=items.map((u:any,i:number)=>{
    const date=new Date(Number(u.created_at||0)).toLocaleString("ar-EG",{dateStyle:"short",timeStyle:"short"});
    return (i+1)+". "+String(u.name||"بدون اسم")+(u.email_verified_at?" ✅":" ⏳")+
      "\n   ✉️ "+String(u.email||"")+
      "\n   📱 "+String(u.phone||"—")+
      "\n   🕐 "+date;
  });
  const buttons=items.slice(0,10).map((u:any)=>[{text:"👤 "+String(u.name||"بدون اسم").slice(0,24),callback_data:"user_view:"+String(u.id)}]);
  const text=["🔎 نتائج البحث عن: "+query,"",...(lines.length?lines:["لا توجد نتائج مطابقة."])].join("\n");
  await telegramCall(env,"sendMessage",{chat_id:chatId,text,reply_markup:{inline_keyboard:[...buttons,[{text:"🔎 بحث جديد",callback_data:"dash_search"}],[{text:"⬅️ رجوع",callback_data:"dash_home"}]]}});
}

async function sendTelegramTraffic(env:Env,chatId:string){
  await ensurePageViews(env);
  const rows=await env.DB.prepare("SELECT day,COUNT(*) AS n FROM site_page_views WHERE day>=date(?, '-6 day') GROUP BY day ORDER BY day DESC").bind(new Date().toISOString().slice(0,10)).all<any>();
  const items=rows.results||[];
  const total=items.reduce((a:any,x:any)=>a+Number(x.n||0),0);
  const lines=items.map((x:any)=>"📅 "+String(x.day)+" — "+Number(x.n||0).toLocaleString("ar-EG")+" زيارة");
  const text=["📈 حركة الموقع — آخر 7 أيام","",...lines,"","🔢 إجمالي الفترة: "+total.toLocaleString("ar-EG")].join("\n");
  await telegramCall(env,"sendMessage",{chat_id:chatId,text,reply_markup:dashBack()});
}

async function sendTelegramAuthStats(env:Env,chatId:string){
  const verified=await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE email_verified_at IS NOT NULL").first<any>();
  const unverified=await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE email_verified_at IS NULL").first<any>();
  const activeSessions=await env.DB.prepare("SELECT COUNT(*) AS n FROM sessions WHERE expires_at>?").bind(Date.now()).first<any>();
  const registerCodes=await env.DB.prepare("SELECT COUNT(*) AS n FROM auth_codes WHERE type='register' AND expires_at>?").bind(Date.now()).first<any>();
  const resetCodes=await env.DB.prepare("SELECT COUNT(*) AS n FROM auth_codes WHERE type='reset' AND expires_at>?").bind(Date.now()).first<any>();
  const text=[
    "🔐 الدخول والتحقق",
    "",
    "✅ حسابات مؤكدة: "+Number(verified?.n||0).toLocaleString("ar-EG"),
    "⏳ حسابات غير مؤكدة: "+Number(unverified?.n||0).toLocaleString("ar-EG"),
    "🟢 جلسات دخول فعالة: "+Number(activeSessions?.n||0).toLocaleString("ar-EG"),
    "📨 أكواد تسجيل فعالة: "+Number(registerCodes?.n||0).toLocaleString("ar-EG"),
    "🔑 أكواد استعادة فعالة: "+Number(resetCodes?.n||0).toLocaleString("ar-EG")
  ].join("\n");
  await telegramCall(env,"sendMessage",{chat_id:chatId,text,reply_markup:dashBack()});
}

async function sendTelegramWhatsAppStats(env:Env,chatId:string){
  await ensureWhatsAppLog(env);
  const users=await env.DB.prepare("SELECT COUNT(*) AS n FROM user_phones WHERE phone IS NOT NULL AND phone<>''").first<any>();
  const sent=await env.DB.prepare("SELECT COUNT(*) AS n FROM whatsapp_messages WHERE status='sent'").first<any>();
  const failed=await env.DB.prepare("SELECT COUNT(*) AS n FROM whatsapp_messages WHERE status='failed'").first<any>();
  const last24=await env.DB.prepare("SELECT COUNT(*) AS n FROM whatsapp_messages WHERE created_at>=?").bind(Date.now()-86400000).first<any>();
  const failed24=await env.DB.prepare("SELECT COUNT(*) AS n FROM whatsapp_messages WHERE status='failed' AND created_at>=?").bind(Date.now()-86400000).first<any>();
  const lastFailure=await env.DB.prepare("SELECT phone,error,created_at FROM whatsapp_messages WHERE status='failed' ORDER BY created_at DESC LIMIT 1").first<any>();
  const text=[
    "📱 تفاصيل واتساب",
    "",
    "📞 أرقام مرتبطة: "+Number(users?.n||0).toLocaleString("ar-EG"),
    "📨 إجمالي الرسائل: "+(Number(sent?.n||0)+Number(failed?.n||0)).toLocaleString("ar-EG"),
    "✅ رسائل ناجحة: "+Number(sent?.n||0).toLocaleString("ar-EG"),
    "❌ رسائل فاشلة: "+Number(failed?.n||0).toLocaleString("ar-EG"),
    "📨 آخر 24 ساعة: "+Number(last24?.n||0).toLocaleString("ar-EG"),
    "❌ فشل آخر 24 ساعة: "+Number(failed24?.n||0).toLocaleString("ar-EG"),
    lastFailure?"\n⚠️ آخر فشل: "+String(lastFailure.phone||"")+" — "+String(lastFailure.error||"غير معروف").slice(0,180):""
  ].join("\n");
  await telegramCall(env,"sendMessage",{chat_id:chatId,text,reply_markup:dashBack()});
}

async function sendTelegramSystem(env:Env,chatId:string){
  let db="❌",users="—",views="—",wa="—";
  try{await ensureSchema(env);await env.DB.prepare("SELECT 1 AS ok").first();db="✅";}catch{}
  try{const r=await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first<any>();users=Number(r?.n||0).toLocaleString("ar-EG");}catch{}
  try{const r=await env.DB.prepare("SELECT COUNT(*) AS n FROM site_page_views").first<any>();views=Number(r?.n||0).toLocaleString("ar-EG");}catch{}
  try{await ensureWhatsAppLog(env);const r=await env.DB.prepare("SELECT COUNT(*) AS n FROM whatsapp_messages").first<any>();wa=Number(r?.n||0).toLocaleString("ar-EG");}catch{}
  const text=[
    "🩺 حالة النظام",
    "",
    "🗄️ قاعدة البيانات D1: "+db,
    "👥 سجلات المستخدمين: "+users,
    "👀 سجلات الزيارات: "+views,
    "📱 سجلات واتساب: "+wa,
    "☁️ Worker: يعمل",
    "🤖 Telegram: متصل",
    "",
    "آخر فحص: "+new Date().toLocaleString("ar-EG")
  ].join("\n");
  await telegramCall(env,"sendMessage",{chat_id:chatId,text,reply_markup:dashBack()});
}

async function setTelegramAdminMode(env:Env,chatId:string,mode:string,payload:any=null){
  await ensureTelegramDashboard(env);
  await env.DB.prepare("INSERT INTO telegram_admin_state(chat_id,mode,payload_json,updated_at) VALUES(?,?,?,?) ON CONFLICT(chat_id) DO UPDATE SET mode=excluded.mode,payload_json=excluded.payload_json,updated_at=excluded.updated_at").bind(chatId,mode,payload===null?null:JSON.stringify(payload),Date.now()).run();
}
async function getTelegramAdminState(env:Env,chatId:string){
  await ensureTelegramDashboard(env);
  const row=await env.DB.prepare("SELECT mode,payload_json FROM telegram_admin_state WHERE chat_id=?").bind(chatId).first<any>();
  let payload:any=null;
  if(row?.payload_json){try{payload=JSON.parse(row.payload_json)}catch{}}
  return {mode:String(row?.mode||""),payload};
}
async function clearTelegramAdminMode(env:Env,chatId:string){
  await ensureTelegramDashboard(env);
  await env.DB.prepare("DELETE FROM telegram_admin_state WHERE chat_id=?").bind(chatId).run();
}

async function safeTelegramAnswer(env:Env,callbackQueryId:string,text?:string,showAlert=false){
  try{
    const payload:any={callback_query_id:callbackQueryId};
    if(text) payload.text=text;
    if(showAlert) payload.show_alert=true;
    await telegramCall(env,"answerCallbackQuery",payload);
  }catch{}
}

async function handleTelegramUpdate(env:Env,update:any){
  const message=update?.message;
  const callback=update?.callback_query;
  const chatId=String(message?.chat?.id ?? callback?.message?.chat?.id ?? "");
  if(!chatId || chatId!==String(env.TELEGRAM_CHAT_ID)) return;
  // Make every dashboard entry point self-initializing, even on a fresh D1 database.
  await ensureSchema(env);
  await ensureAdminTools(env);

  if(callback){
    if(callback.id) await safeTelegramAnswer(env,callback.id);
    const data=String(callback.data||"");
    if(data==="dash_center"){await clearTelegramAdminMode(env,chatId);await sendTelegramCommandCenter(env,chatId);return;}
    if(data==="dash_live"){await clearTelegramAdminMode(env,chatId);await sendTelegramLive(env,chatId);return;}
    if(data==="dash_growth"){await clearTelegramAdminMode(env,chatId);await sendTelegramGrowth(env,chatId);return;}
    if(data==="dash_security"){await clearTelegramAdminMode(env,chatId);await sendTelegramSecurity(env,chatId);return;}
    if(data==="dash_data"){await clearTelegramAdminMode(env,chatId);await sendTelegramDataCenter(env,chatId);return;}
    if(data==="dash_alerts"){await clearTelegramAdminMode(env,chatId);await sendTelegramAlerts(env,chatId);return;}
    if(data==="dash_campaigns"){await clearTelegramAdminMode(env,chatId);await sendTelegramCampaigns(env,chatId);return;}
    if(data==="dash_home"){await clearTelegramAdminMode(env,chatId);await sendTelegramDashboard(env,chatId);return;}
    if(data==="dash_stats"){await sendTelegramDashboard(env,chatId);return;}
    if(data==="dash_users"){await clearTelegramAdminMode(env,chatId);await sendTelegramUsers(env,chatId,1);return;}
    if(data.startsWith("users_page:")){await clearTelegramAdminMode(env,chatId);await sendTelegramUsers(env,chatId,Number(data.slice(11))||1);return;}
    if(data==="dash_recent"){await clearTelegramAdminMode(env,chatId);await sendTelegramRecentUsers(env,chatId);return;}    if(data==="dash_search"){await setTelegramAdminMode(env,chatId,"user_search");await telegramCall(env,"sendMessage",{chat_id:chatId,text:"🔎 ابعت الاسم أو الإيميل أو رقم الواتساب اللي عايز تدور عليه.",reply_markup:{inline_keyboard:[[ {text:"❌ إلغاء",callback_data:"dash_cancel"} ]] }});return;}
    if(data==="dash_traffic"){await clearTelegramAdminMode(env,chatId);await sendTelegramTraffic(env,chatId);return;}
    if(data==="dash_traffic30"){await clearTelegramAdminMode(env,chatId);await sendTelegramTrafficDetailed(env,chatId);return;}

    if(data==="global_notification_send"){
      const state=await getTelegramAdminState(env,chatId);
      if(state.mode!=="global_notification_confirm"){await sendTelegramGlobalNotifications(env,chatId);return;}
      await safeTelegramAnswer(env,callback.id,"⏳ جاري الإرسال...");
      await createGlobalNotification(env,chatId,state.payload);
      return;
    }
    if(data==="dash_global_notifications"){await clearTelegramAdminMode(env,chatId);await sendTelegramGlobalNotifications(env,chatId);return;}
    if(data==="global_notification_add"){
      await setTelegramAdminMode(env,chatId,"global_notification_title",{});
      await telegramCall(env,"sendMessage",{chat_id:chatId,text:"📢 إضافة إشعار عام\n\nابعت عنوان الإشعار.",reply_markup:{inline_keyboard:[[{text:"❌ إلغاء",callback_data:"dash_cancel"}]]}});
      return;
    }
    if(data.startsWith("global_notification_delete:")){
      const id=data.slice("global_notification_delete:".length);
      await env.DB.prepare("UPDATE global_notifications SET enabled=0 WHERE id=?").bind(id).run();
      await sendTelegramGlobalNotifications(env,chatId);
      return;
    }
    if(data==="dash_global_lectures"){await clearTelegramAdminMode(env,chatId);await sendTelegramGlobalLectures(env,chatId);return;}
    if(data==="global_lecture_add"){
      await setTelegramAdminMode(env,chatId,"global_lecture_title",{});
      await telegramCall(env,"sendMessage",{chat_id:chatId,text:"📚 إضافة مصدر عام\n\nابعت اسم المصدر.",reply_markup:{inline_keyboard:[[{text:"❌ إلغاء",callback_data:"dash_cancel"}]]}});
      return;
    }
    if(data.startsWith("global_lecture_delete:")){
      const id=data.slice("global_lecture_delete:".length);
      const row=await env.DB.prepare("SELECT title FROM global_lectures WHERE id=?").bind(id).first<any>();
      if(row){await env.DB.prepare("UPDATE global_lectures SET enabled=0,updated_at=? WHERE id=?").bind(Date.now(),id).run();await telegramCall(env,"sendMessage",{chat_id:chatId,text:"🗑️ تم إخفاء المصدر العام: "+String(row.title),reply_markup:{inline_keyboard:[[{text:"📚 مصادر المحاضرات",callback_data:"dash_global_lectures"}]]}});} else await sendTelegramGlobalLectures(env,chatId);
      return;
    }
    if(data==="dash_tools"){await clearTelegramAdminMode(env,chatId);await sendTelegramAdminTools(env,chatId);return;}
    if(data==="admin_activity"){await clearTelegramAdminMode(env,chatId);await sendTelegramAdminActivity(env,chatId);return;}
    if(data==="admin_report"){await clearTelegramAdminMode(env,chatId);await sendTelegramAdminReport(env,chatId);return;}
    if(data==="admin_maintenance"){await clearTelegramAdminMode(env,chatId);await toggleMaintenance(env,chatId);return;}
    if(data==="admin_announcements"){await clearTelegramAdminMode(env,chatId);await sendTelegramAnnouncements(env,chatId);return;}
    if(data==="announcement_add"){
      await setTelegramAdminMode(env,chatId,"announcement_title");
      await telegramCall(env,"sendMessage",{chat_id:chatId,text:"📢 إضافة إعلان للموقع\n\nابعت عنوان الإعلان.",reply_markup:{inline_keyboard:[[ {text:"❌ إلغاء",callback_data:"dash_cancel"} ]] }});
      return;
    }
    if(data==="announcement_location_top"||data==="announcement_location_center"||data==="announcement_location_modal"){
      const state=await getTelegramAdminState(env,chatId);
      const placement=data.endsWith("top")?"top":data.endsWith("center")?"center":"modal";
      const payload={...state.payload,placement};
      if(placement==="modal"){
        await setTelegramAdminMode(env,chatId,"announcement_duration",payload);
        await telegramCall(env,"sendMessage",{chat_id:chatId,text:"🚨 Popup كبير\n\nكام ثانية يفضل ظاهر؟\nاكتب رقم من 1 إلى 60.\nمثال: 5",reply_markup:{inline_keyboard:[[ {text:"⚡ 5 ثواني",callback_data:"announcement_duration_5"},{text:"⚡ 10 ثواني",callback_data:"announcement_duration_10"}],[{text:"❌ إلغاء",callback_data:"dash_cancel"}]] }});
      }else{
        await setTelegramAdminMode(env,chatId,"announcement_type",payload);
        await telegramCall(env,"sendMessage",{chat_id:chatId,text:"📦 اختار نوع الظهور:",reply_markup:{inline_keyboard:[
          [{text:"👋 أول دخول فقط",callback_data:"announcement_type_first"}],
          [{text:"📌 ثابت",callback_data:"announcement_type_fixed"}],
          [{text:"⏱️ مؤقت",callback_data:"announcement_type_temporary"}],
          [{text:"❌ إلغاء",callback_data:"dash_cancel"}]
        ]}});
      }
      return;
    }
    if(data==="announcement_duration_5"||data==="announcement_duration_10"){
      const state=await getTelegramAdminState(env,chatId);
      const durationSec=data.endsWith("_5")?5:10;
      await setTelegramAdminMode(env,chatId,"announcement_type",{...state.payload,durationSec});
      await telegramCall(env,"sendMessage",{chat_id:chatId,text:"📦 اختار نوع الظهور:",reply_markup:{inline_keyboard:[
        [{text:"👋 أول دخول فقط",callback_data:"announcement_type_first"}],
        [{text:"📌 ثابت",callback_data:"announcement_type_fixed"}],
        [{text:"⏱️ مؤقت",callback_data:"announcement_type_temporary"}],
        [{text:"❌ إلغاء",callback_data:"dash_cancel"}]
      ]}});
      return;
    }
    if(data==="announcement_type_first"||data==="announcement_type_fixed"){
      const state=await getTelegramAdminState(env,chatId);
      await setTelegramAdminMode(env,chatId,"announcement_button_text",{...state.payload,type:data.endsWith("_first")?"first":"fixed"});
      await telegramCall(env,"sendMessage",{chat_id:chatId,text:"🔘 زر اختياري\n\nابعت اسم الزر، أو اضغط تخطي لو مش عايز زر.",reply_markup:{inline_keyboard:[[ {text:"⏭️ تخطي",callback_data:"announcement_skip_button"} ],[ {text:"❌ إلغاء",callback_data:"dash_cancel"} ]] }});
      return;
    }
    if(data==="announcement_type_temporary"){
      const state=await getTelegramAdminState(env,chatId);
      await setTelegramAdminMode(env,chatId,"announcement_duration_hours",{...state.payload,type:"temporary"});
      await telegramCall(env,"sendMessage",{chat_id:chatId,text:"⏱️ الإعلان المؤقت\n\nابعت مدة ظهور الإعلان بالساعات.\nمثال: 24",reply_markup:{inline_keyboard:[[ {text:"❌ إلغاء",callback_data:"dash_cancel"} ]] }});
      return;
    }
    if(data==="announcement_skip_button"){
      const state=await getTelegramAdminState(env,chatId);
      await createSiteAnnouncement(env,chatId,{...state.payload,buttonText:"",buttonUrl:""});
      return;
    }
    if(data==="announcement_toggle"){await clearTelegramAdminMode(env,chatId);await toggleSiteAnnouncement(env,chatId);return;}
    if(data==="announcement_delete"){await clearTelegramAdminMode(env,chatId);await deleteSiteAnnouncement(env,chatId);return;}
    
    if(data==="dash_cleanup"){await clearTelegramAdminMode(env,chatId);await cleanupAdminData(env,chatId);return;}
    if(data==="dash_auth"){await clearTelegramAdminMode(env,chatId);await sendTelegramAuthStats(env,chatId);return;}
    if(data==="dash_wa"){await clearTelegramAdminMode(env,chatId);await sendTelegramWhatsAppStats(env,chatId);return;}
    if(data==="dash_system"){await clearTelegramAdminMode(env,chatId);await sendTelegramSystem(env,chatId);return;}
    if(data.startsWith("user_view:")){await clearTelegramAdminMode(env,chatId);await sendTelegramUserDetails(env,chatId,data.slice(10));return;}
    if(data.startsWith("user_logout:")){await clearTelegramAdminMode(env,chatId);await logoutUserSessions(env,chatId,data.slice(11));await adminLog(env,chatId,"LOGOUT_USER",data.slice(11));return;}
    if(data.startsWith("user_delete:")){await clearTelegramAdminMode(env,chatId);await sendTelegramUserActionConfirm(env,chatId,data.slice(12),"delete");return;}
    if(data.startsWith("user_delete_confirm:")){await clearTelegramAdminMode(env,chatId);await deleteUser(env,chatId,data.slice(20));return;}
    if(data==="dash_broadcast"){await setTelegramAdminMode(env,chatId,"broadcast");await telegramCall(env,"sendMessage",{chat_id:chatId,text:"📢 ابعتلي الرسالة اللي عايز تبعتها لكل أرقام واتساب المسجلة.\n\n⚠️ بعد ما تبعتها هعرض عليك تأكيد قبل الإرسال للجميع.",reply_markup:{inline_keyboard:[[ {text:"❌ إلغاء",callback_data:"dash_cancel"} ]] }});return;}
    if(data==="dash_email_broadcast"){await setTelegramAdminMode(env,chatId,"email_broadcast_subject");await telegramCall(env,"sendMessage",{chat_id:chatId,text:"📧 إرسال رسالة Gmail\n\nابعت عنوان الرسالة (Subject).\n\n⚠️ سيتم الإرسال إلى كل الإيميلات المسجلة.",reply_markup:{inline_keyboard:[[ {text:"❌ إلغاء",callback_data:"dash_cancel"} ]] }});return;}
    if(data==="dash_email_broadcast_confirm"){
      const state=await getTelegramAdminState(env,chatId);
      const subject=String(state.payload?.subject||"").trim();
      const pending=String(state.payload?.message||"").trim();
      if(!subject||!pending){await clearTelegramAdminMode(env,chatId);await sendTelegramDashboard(env,chatId);return;}
      await clearTelegramAdminMode(env,chatId);
      await telegramCall(env,"sendMessage",{chat_id:chatId,text:"⏳ جاري إرسال حملة Gmail لكل الإيميلات المسجلة..."});
      try{
        const result=await broadcastEmail(env,subject,pending);
        await adminLog(env,chatId,"EMAIL_BROADCAST","all",subject+" — "+pending);
        await telegramCall(env,"sendMessage",{chat_id:chatId,text:["📧 نتيجة حملة Gmail","","👥 إجمالي الإيميلات: "+result.total,"✅ تم الإرسال: "+result.sent,"❌ فشل: "+result.failed,result.error?"\n⚠️ "+result.error:""].join("\n"),reply_markup:{inline_keyboard:[[ {text:"🎛️ لوحة التحكم",callback_data:"dash_home"} ]] }});
      }catch(e){await telegramCall(env,"sendMessage",{chat_id:chatId,text:"⚠️ تعذر تنفيذ حملة Gmail: "+(e instanceof Error?e.message:String(e)).slice(0,700),reply_markup:{inline_keyboard:[[ {text:"🎛️ لوحة التحكم",callback_data:"dash_home"} ]] }});}
      return;
    }
    if(data==="dash_broadcast_confirm"){
      const state=await getTelegramAdminState(env,chatId);
      const pending=String(state.payload?.message||"").trim();
      if(!pending){await clearTelegramAdminMode(env,chatId);await sendTelegramDashboard(env,chatId);return;}
      await clearTelegramAdminMode(env,chatId);
      await telegramCall(env,"sendMessage",{chat_id:chatId,text:"⏳ جاري إرسال الحملة لكل الأرقام..."});
      try{
        const result=await broadcastWhatsApp(env,pending);
        await adminLog(env,chatId,"WHATSAPP_BROADCAST","all",pending);
        await telegramCall(env,"sendMessage",{chat_id:chatId,text:["📢 نتيجة الحملة","","👥 الإجمالي: "+result.total,"✅ تم الإرسال: "+result.sent,"❌ فشل: "+result.failed,result.errors.length?"\nأمثلة للأخطاء:\n"+result.errors.join("\n"):""].join("\n"),reply_markup:{inline_keyboard:[[ {text:"🎛️ لوحة التحكم",callback_data:"dash_home"} ]] }});
      }catch(e){await telegramCall(env,"sendMessage",{chat_id:chatId,text:"⚠️ تعذر تنفيذ الحملة: "+(e instanceof Error?e.message:String(e)).slice(0,700),reply_markup:{inline_keyboard:[[ {text:"🎛️ لوحة التحكم",callback_data:"dash_home"} ]] }});}
      return;
    }
    if(data==="dash_cancel"){await clearTelegramAdminMode(env,chatId);await sendTelegramDashboard(env,chatId);return;}
    return;
  }

  const text=String(message?.text||"").trim();
  await ensureAdminTools(env);
  const state=await getTelegramAdminState(env,chatId);
  if(state.mode==="global_notification_title" && text){
    await setTelegramAdminMode(env,chatId,"global_notification_message",{title:text.slice(0,140)});
    await telegramCall(env,"sendMessage",{chat_id:chatId,text:"📝 ابعت نص الإشعار.",reply_markup:{inline_keyboard:[[{text:"❌ إلغاء",callback_data:"dash_cancel"}]]}});
    return;
  }
  if(state.mode==="global_notification_message" && text){
    await setTelegramAdminMode(env,chatId,"global_notification_confirm",{...state.payload,message:text.slice(0,2000)});
    await telegramCall(env,"sendMessage",{chat_id:chatId,text:"🎯 الإشعار جاهز للإرسال كـ Push حقيقي على الأجهزة.\n\nاضغط إرسال الآن.",reply_markup:{inline_keyboard:[
      [{text:"🚀 إرسال الآن",callback_data:"global_notification_send"}],
      [{text:"❌ إلغاء",callback_data:"dash_cancel"}]
    ]}});
    return;
  }
  if(state.mode==="global_lecture_title" && text){
    await setTelegramAdminMode(env,chatId,"global_lecture_subject",{title:text.slice(0,160)});
    await telegramCall(env,"sendMessage",{chat_id:chatId,text:"📖 اكتب اسم المادة.",reply_markup:{inline_keyboard:[[{text:"❌ إلغاء",callback_data:"dash_cancel"}]]}});
    return;
  }
  if(state.mode==="global_lecture_subject" && text){
    await setTelegramAdminMode(env,chatId,"global_lecture_url",{...state.payload,subject_name:text.slice(0,100)});
    await telegramCall(env,"sendMessage",{chat_id:chatId,text:"🔗 ابعت رابط المصدر.\nلازم يبدأ بـ https:// أو http://",reply_markup:{inline_keyboard:[[{text:"❌ إلغاء",callback_data:"dash_cancel"}]]}});
    return;
  }
  if(state.mode==="global_lecture_url" && text){
    if(!/^https?:\/\//i.test(text)){await telegramCall(env,"sendMessage",{chat_id:chatId,text:"❌ الرابط لازم يبدأ بـ https:// أو http://"});return;}
    await createGlobalLecture(env,chatId,{...state.payload,url:text});
    return;
  }
  if(state.mode==="announcement_title" && text){
    await setTelegramAdminMode(env,chatId,"announcement_message",{title:text.slice(0,120)});
    await telegramCall(env,"sendMessage",{chat_id:chatId,text:"📝 تمام. ابعت نص الإعلان اللي هيظهر للمستخدمين.",reply_markup:{inline_keyboard:[[ {text:"❌ إلغاء",callback_data:"dash_cancel"} ]] }});
    return;
  }
  if(state.mode==="announcement_message" && text){
    await setTelegramAdminMode(env,chatId,"announcement_location",{title:String(state.payload?.title||""),message:text.slice(0,2000)});
    await telegramCall(env,"sendMessage",{chat_id:chatId,text:"📍 حدد مكان الإعلان:",reply_markup:{inline_keyboard:[
      [{text:"⬆️ أعلى الصفحة",callback_data:"announcement_location_top"}],
      [{text:"🎯 نص الصفحة",callback_data:"announcement_location_center"}],
      [{text:"🚨 إعلان كبير Popup",callback_data:"announcement_location_modal"}],
      [{text:"❌ إلغاء",callback_data:"dash_cancel"}]
    ]}});
    return;
  }
  if(state.mode==="announcement_duration" && text){
    const seconds=Number(text.replace(/[^0-9.]/g,""));
    if(!Number.isFinite(seconds)||seconds<1||seconds>60){
      await telegramCall(env,"sendMessage",{chat_id:chatId,text:"❌ اكتب عدد ثواني بين 1 و60."});
      return;
    }
    await setTelegramAdminMode(env,chatId,"announcement_type",{...state.payload,durationSec:Math.round(seconds)});
    await telegramCall(env,"sendMessage",{chat_id:chatId,text:"📦 اختار نوع الظهور:",reply_markup:{inline_keyboard:[
      [{text:"👋 أول دخول فقط",callback_data:"announcement_type_first"}],
      [{text:"📌 ثابت",callback_data:"announcement_type_fixed"}],
      [{text:"⏱️ مؤقت",callback_data:"announcement_type_temporary"}],
      [{text:"❌ إلغاء",callback_data:"dash_cancel"}]
    ]}});
    return;
  }
  if(state.mode==="announcement_duration_hours" && text){
    const hours=Number(text.replace(/[^0-9.]/g,""));
    if(!Number.isFinite(hours)||hours<1||hours>720){
      await telegramCall(env,"sendMessage",{chat_id:chatId,text:"❌ اكتب عدد ساعات بين 1 و720."});
      return;
    }
    await setTelegramAdminMode(env,chatId,"announcement_button_text",{...state.payload,hours});
    await telegramCall(env,"sendMessage",{chat_id:chatId,text:"🔘 زر اختياري\n\nابعت اسم الزر، أو اضغط تخطي لو مش عايز زر.",reply_markup:{inline_keyboard:[[ {text:"⏭️ تخطي",callback_data:"announcement_skip_button"} ],[ {text:"❌ إلغاء",callback_data:"dash_cancel"} ]] }});
    return;
  }
  if(state.mode==="announcement_button_text" && text){
    await setTelegramAdminMode(env,chatId,"announcement_button_url",{...state.payload,buttonText:text.slice(0,50)});
    await telegramCall(env,"sendMessage",{chat_id:chatId,text:"🔗 ابعت الرابط اللي يفتحه الزر.\nمثال: https://example.com",reply_markup:{inline_keyboard:[[ {text:"❌ إلغاء",callback_data:"dash_cancel"} ]] }});
    return;
  }
  if(state.mode==="announcement_button_url" && text){
    if(!/^https?:\/\//i.test(text)){await telegramCall(env,"sendMessage",{chat_id:chatId,text:"❌ الرابط لازم يبدأ بـ https:// أو http://"});return;}
    await createSiteAnnouncement(env,chatId,{...state.payload,buttonUrl:text.slice(0,500)});
    return;
  }
  if(state.mode==="email_broadcast_subject" && text){
    await setTelegramAdminMode(env,chatId,"email_broadcast_message",{subject:text.slice(0,180)});
    await telegramCall(env,"sendMessage",{chat_id:chatId,text:"✉️ تمام. دلوقتي ابعت نص الرسالة اللي هيتبعت على Gmail لكل المستخدمين.",reply_markup:{inline_keyboard:[[ {text:"❌ إلغاء",callback_data:"dash_cancel"} ]] }});
    return;
  }
  if(state.mode==="email_broadcast_message" && text){
    await setTelegramAdminMode(env,chatId,"email_broadcast_pending",{subject:String(state.payload?.subject||""),message:text});
    await telegramCall(env,"sendMessage",{chat_id:chatId,text:"📝 معاينة رسالة Gmail\n\n📌 العنوان: "+String(state.payload?.subject||"—")+"\n\n"+text+"\n\nهل أنت متأكد من الإرسال لكل الإيميلات المسجلة؟",reply_markup:{inline_keyboard:[[ {text:"📧 تأكيد الإرسال",callback_data:"dash_email_broadcast_confirm"},{text:"❌ إلغاء",callback_data:"dash_cancel"} ]] }});
    return;
  }
  if(state.mode==="broadcast" && text){
    await setTelegramAdminMode(env,chatId,"broadcast_pending",{message:text});
    await telegramCall(env,"sendMessage",{chat_id:chatId,text:"📝 الرسالة جاهزة للإرسال:\n\n"+text+"\n\nهل أنت متأكد إنك عايز تبعتها لكل أرقام واتساب؟",reply_markup:{inline_keyboard:[[ {text:"✅ تأكيد الإرسال",callback_data:"dash_broadcast_confirm"},{text:"❌ إلغاء",callback_data:"dash_cancel"} ]] }});
    return;
  }
  if(state.mode==="user_search" && text){
    await clearTelegramAdminMode(env,chatId);
    await sendTelegramUserSearch(env,chatId,text);
    return;
  }

  if(text==="/start" || text==="/panel" || text==="/dashboard" || text==="/stats" || text==="📊 الإحصائيات الآن"){await sendTelegramDashboard(env,chatId);return;}
  if(text==="/report"){await sendTelegramAdminReport(env,chatId);return;}
  if(text==="/tools"){await sendTelegramAdminTools(env,chatId);return;}
  if(text.startsWith("/waall ")){
    const messageText=text.slice(7).trim();
    if(!messageText){await telegramCall(env,"sendMessage",{chat_id:chatId,text:"الاستخدام: /waall رسالتك هنا"});return;}
    try{const result=await broadcastWhatsApp(env,messageText);await telegramCall(env,"sendMessage",{chat_id:chatId,text:"📲 تم إرسال حملة واتساب\n\n👥 الإجمالي: "+result.total+"\n✅ نجح: "+result.sent+"\n❌ فشل: "+result.failed});}
    catch(e){await telegramCall(env,"sendMessage",{chat_id:chatId,text:"⚠️ تعذر إرسال حملة واتساب: "+(e instanceof Error?e.message:String(e)).slice(0,700)});}
    return;
  }
  if(text.startsWith("/wa ")){
    const parts=text.split(/\s+/),phone=cleanPhone(parts[1]||""),messageText=parts.slice(2).join(" ").trim();
    if(!validPhone(phone)||!messageText){await telegramCall(env,"sendMessage",{chat_id:chatId,text:"الاستخدام: /wa +201xxxxxxxxx رسالتك هنا"});return;}
    try{const row=await env.DB.prepare("SELECT user_id FROM user_phones WHERE phone=?").bind(phone).first<any>();const result=await sendWhatsAppToUser(env,String(row?.user_id||""),phone,messageText);await telegramCall(env,"sendMessage",{chat_id:chatId,text:result.ok?"✅ تم إرسال الرسالة على واتساب إلى "+phone:"❌ فشل الإرسال إلى "+phone+"\n"+result.error});}
    catch(e){await telegramCall(env,"sendMessage",{chat_id:chatId,text:"⚠️ تعذر إرسال واتساب: "+(e instanceof Error?e.message:String(e)).slice(0,700)});}
    return;
  }
  await sendTelegramDashboard(env,chatId);
}

export default {
  async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response> {
    const url=new URL(request.url);
    if(url.pathname.startsWith("/api/")) {
      try {
        if(request.method==="OPTIONS") return new Response(null,{status:204,headers:{"access-control-allow-origin":"*","access-control-allow-methods":"GET,POST,PUT,DELETE,OPTIONS","access-control-allow-headers":"content-type, accept","cache-control":"no-store"}});
        if(url.pathname!=="/api/pageview" && url.pathname!=="/api/telegram/webhook" && url.pathname!=="/api/health"){
          const maintenance=await getAdminSetting(env,"maintenance","0");
          if(maintenance==="1") return json({error:"الموقع في وضع الصيانة حاليًا. حاول مرة أخرى لاحقًا."},503,{"retry-after":"300"});
        }
        // Owner panel uses one fixed account and its own HttpOnly cookie.
        // It does not create a user/session record and does not depend on the site's normal auth.
        if(url.pathname==="/api/push/public-key" && request.method==="GET") {
          if(!env.VAPID_PUBLIC_KEY) return json({error:"Push notifications are not configured"},503);
          return json({publicKey:env.VAPID_PUBLIC_KEY});
        }
        if(url.pathname==="/api/push/status" && request.method==="GET") {
          await ensureSchema(env);
          const u=await userFrom(request,env); if(!u) return json({error:"يجب تسجيل الدخول"},401);
          await ensurePushSubscriptions(env);
          const row=await env.DB.prepare("SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id=?").bind(u.id).first<any>();
          return json({enabled:Number(row?.n||0)>0,devices:Number(row?.n||0)});
        }
        if(url.pathname==="/api/push/subscribe" && request.method==="POST") {
          await ensureSchema(env);
          const u=await userFrom(request,env); if(!u) return json({error:"يجب تسجيل الدخول"},401);
          const b=await body(request), sub=validatePushSubscription(b?.subscription);
          if(!sub) return json({error:"اشتراك Push غير صالح"},400);
          await ensurePushSubscriptions(env);
          const now=Date.now();
          await env.DB.prepare("INSERT INTO push_subscriptions(id,user_id,endpoint,p256dh,auth,user_agent,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,p256dh=excluded.p256dh,auth=excluded.auth,user_agent=excluded.user_agent,updated_at=excluded.updated_at").bind(randomHex(16),u.id,sub.endpoint,sub.p256dh,sub.auth,String(b?.userAgent||"").slice(0,500),now,now).run();
          return json({ok:true});
        }
        if(url.pathname==="/api/push/subscribe" && request.method==="DELETE") {
          await ensureSchema(env);
          const u=await userFrom(request,env); if(!u) return json({error:"يجب تسجيل الدخول"},401);
          const b=await body(request), endpoint=String(b?.endpoint||"").trim();
          if(endpoint) await env.DB.prepare("DELETE FROM push_subscriptions WHERE user_id=? AND endpoint=?").bind(u.id,endpoint).run();
          else await env.DB.prepare("DELETE FROM push_subscriptions WHERE user_id=?").bind(u.id).run();
          return json({ok:true});
        }
        if(url.pathname==="/api/global-notifications" && request.method==="GET") {
          try {
            await ensureGlobalNotifications(env);
            const now=Date.now();
            await env.DB.prepare("UPDATE global_notifications SET enabled=0 WHERE enabled=1 AND expires_at IS NOT NULL AND expires_at<=?").bind(now).run();
            const rows=await env.DB.prepare("SELECT id,title,message,type,expires_at,created_at FROM global_notifications WHERE enabled=1 AND (expires_at IS NULL OR expires_at>?) ORDER BY created_at DESC LIMIT 20").bind(now).all<any>();
            return json({notifications:(rows.results||[]).map((x:any)=>({id:String(x.id),title:String(x.title||""),message:String(x.message||""),type:String(x.type||"info"),expiresAt:x.expires_at?Number(x.expires_at):null,createdAt:Number(x.created_at||0)}))});
          } catch(e) { console.error("Global notifications API failed",e); return json({notifications:[]}); }
        }
        if(url.pathname==="/api/global-lectures" && request.method==="GET") {
          try { const items=await getGlobalLectures(env); return json({lectures:items.map((x:any)=>({id:String(x.id),title:String(x.title||""),subjectName:String(x.subject_name||""),url:String(x.url||""),description:String(x.description||""),kind:String(x.kind||"link"),createdAt:Number(x.created_at||0)}))}); }
          catch(e) { console.error("Global lectures API failed",e); return json({lectures:[]}); }
        }
        if(url.pathname==="/api/announcement" && request.method==="GET") {
          const a=await getSiteAnnouncement(env);
          if(!a||!a.enabled)return json({announcement:null});
          if(a.expiresAt&&Number(a.expiresAt)<=Date.now()){
            a.enabled=false;
            await saveSiteAnnouncement(env,a);
            return json({announcement:null});
          }
          return json({announcement:{
            id:String(a.id||""),title:String(a.title||""),message:String(a.message||""),
            type:String(a.type||"fixed"),placement:String(a.placement||"top"),
            durationSec:Number(a.durationSec||0),buttonText:String(a.buttonText||""),
            buttonUrl:String(a.buttonUrl||""),expiresAt:a.expiresAt?Number(a.expiresAt):null
          }});
        }
        if(url.pathname==="/api/pageview" && request.method==="POST") {
          try {
            await ensurePageViews(env);
            const day=new Date().toISOString().slice(0,10);
            await env.DB.prepare("INSERT INTO site_page_views(day,created_at) VALUES(?,?)").bind(day,Date.now()).run();
          } catch(e) { console.error("Page view counter failed",e); }
          return json({ok:true});
        }
        if(url.pathname==="/api/telegram/webhook" && request.method==="POST") {
          const update=await body(request);
          try {
            // Process Telegram updates before acknowledging the webhook.
            // This keeps callback_query button presses reliable instead of relying on background execution.
            await handleTelegramUpdate(env,update);
          } catch(e) {
            console.error("Telegram webhook error",e);
            const chatId=String(update?.message?.chat?.id ?? update?.callback_query?.message?.chat?.id ?? "");
            if(chatId && chatId===String(env.TELEGRAM_CHAT_ID)) {
              try {
                await telegramCall(env,"sendMessage",{
                  chat_id:chatId,
                  text:"⚠️ حصل خطأ أثناء تنفيذ الأمر. جرّب الزر مرة تانية."
                });
              } catch(err) {
                console.error("Telegram error reply failed",err);
              }
            }
          }
          return json({ok:true});
        }
        if(request.method==="OPTIONS" && url.pathname.startsWith("/api/")){
          return new Response(null,{status:204,headers:{
            "access-control-allow-origin":"https://thanaweya.sheenomatp.workers.dev",
            "access-control-allow-credentials":"true",
            "access-control-allow-methods":"GET,POST,PUT,DELETE,OPTIONS",
            "access-control-allow-headers":"content-type",
            "access-control-max-age":"86400",
            "cache-control":"no-store"
          }});
        }
        if(url.pathname==="/api/health") {
          try { await ensureSchema(env); await env.DB.prepare("SELECT 1 AS ok").first(); return json({ok:true,db:true}); }
          catch(e) { console.error("D1 health check failed",e); return json({ok:false,db:false,error:"D1 binding/database is not available. Check the DB binding in Cloudflare."},503); }
        }
        await ensureSchema(env);
        if(url.pathname!=="/api/telegram/webhook" && url.pathname!=="/api/pageview" && url.pathname!=="/api/health"){
          try{
            const currentUser=await userFrom(request,env);
            if(currentUser) ctx.waitUntil(touchUserActivity(env,currentUser.id,url.pathname,request.method));
          }catch{}
        }
        if(url.pathname==="/api/auth/register/start" && request.method==="POST") {
          const b=await body(request), email=cleanEmail(b?.email), name=cleanName(b?.name), password=String(b?.password||""), phone=cleanPhone(b?.phone);
          if(!name||!email||password.length<8||!phone) return json({error:"الاسم والإيميل وكلمة السر (8 أحرف على الأقل) ورقم واتساب مطلوبة"},400);
          const exists=await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first(); if(exists) return json({error:"الإيميل مستخدم بالفعل"},409);
          if(!validPhone(phone)) return json({error:"رقم واتساب غير صالح"},400);
          if(phone){const phoneExists=await env.DB.prepare("SELECT user_id FROM user_phones WHERE phone=?").bind(phone).first();if(phoneExists)return json({error:"رقم واتساب مستخدم بالفعل"},409);}
          const salt=randomHex(16), pass=await hashPassword(password,salt), code=generateOtpCode(), now=Date.now(), expires=now+10*60*1000, payload=JSON.stringify({name,password_hash:pass,password_salt:salt,phone:phone||null});
          await env.DB.prepare("DELETE FROM auth_codes WHERE email=? AND type='register'").bind(email).run();
          await env.DB.prepare("INSERT INTO auth_codes(id,email,type,code_hash,payload_json,expires_at,attempts,created_at) VALUES(?,?,?,?,?,?,?,?)").bind(randomHex(16),email,"register",await otpHash(email,"register",code),payload,expires,0,now).run();
          try { await sendEmailOtp(env,email,code,"register"); } catch(e){ await env.DB.prepare("DELETE FROM auth_codes WHERE email=? AND type='register'").bind(email).run(); throw e; }
          return json({ok:true,email});
        }
        if(url.pathname==="/api/auth/register/verify" && request.method==="POST") {
          const b=await body(request), email=cleanEmail(b?.email), code=String(b?.code||"").replace(/\D/g,"").slice(0,6);
          const row=await env.DB.prepare("SELECT * FROM auth_codes WHERE email=? AND type='register' ORDER BY created_at DESC LIMIT 1").bind(email).first<any>();
          if(!row||Number(row.expires_at)<Date.now()) return json({error:"الكود انتهت صلاحيته. اطلب كود جديد."},400);
          if(!/^\d{4,10}$/.test(code)) return json({error:"اكتب كود التأكيد بشكل صحيح"},400);
          if(Number(row.attempts)>=5) return json({error:"تم تجاوز عدد المحاولات. اطلب كود جديد."},429);
          const ok=(await otpHash(email,"register",code))===row.code_hash;
          if(!ok){await env.DB.prepare("UPDATE auth_codes SET attempts=attempts+1 WHERE id=?").bind(row.id).run();return json({error:"كود التأكيد غير صحيح"},400);}
          const p=JSON.parse(row.payload_json||"{}");
          const exists=await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first(); if(exists){await env.DB.prepare("DELETE FROM auth_codes WHERE id=?").bind(row.id).run();return json({error:"الإيميل مستخدم بالفعل"},409);}
          const id=randomHex(16), now=Date.now();
          await env.DB.batch([env.DB.prepare("INSERT INTO users(id,email,name,password_hash,password_salt,email_verified_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").bind(id,email,p.name,p.password_hash,p.password_salt,now,now,now),env.DB.prepare("INSERT INTO user_data(user_id,data_json,updated_at) VALUES(?,?,?)").bind(id,"",now),...(p.phone?[env.DB.prepare("INSERT INTO user_phones(user_id,phone,updated_at) VALUES(?,?,?)").bind(id,p.phone,now)]:[]),env.DB.prepare("DELETE FROM auth_codes WHERE id=?").bind(row.id)]);
          ctx.waitUntil(sendAdminAlert(env,"👤 تسجيل مستخدم جديد","👤 "+p.name+"\n✉️ "+email+"\n📱 "+String(p.phone||"غير مرتبط"),"new_user",0));
          const token=await createSession(id,env); return json({user:{id,email,name:p.name,phone:p.phone||null}},200,{"set-cookie":sessionCookie(token)});
        }
        if(url.pathname==="/api/auth/forgot/start" && (request.method==="POST"||request.method==="GET")) {
          const b=request.method==="POST"?await body(request):null;
          const email=cleanEmail(request.method==="GET"?url.searchParams.get("email"):b?.email);
          const u=await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first<any>();
          if(u){
            const code=generateOtpCode(),now=Date.now();
            await env.DB.prepare("DELETE FROM auth_codes WHERE email=? AND type='reset'").bind(email).run();
            await env.DB.prepare("INSERT INTO auth_codes(id,email,type,code_hash,payload_json,expires_at,attempts,created_at) VALUES(?,?,?,?,?,?,?,?)").bind(randomHex(16),email,"reset",await otpHash(email,"reset",code),null,now+10*60*1000,0,now).run();
            try{await sendEmailOtp(env,email,code,"reset");}catch(e){await env.DB.prepare("DELETE FROM auth_codes WHERE email=? AND type='reset'").bind(email).run();throw e;}}
          return json({ok:true});
        }
        if(url.pathname==="/api/auth/reset" && request.method==="POST") {
          const b=await body(request), email=cleanEmail(b?.email), code=String(b?.code||"").replace(/\D/g,"").slice(0,6), password=String(b?.password||"");
          if(password.length<8)return json({error:"كلمة السر لازم تكون 8 أحرف على الأقل"},400);
          const row=await env.DB.prepare("SELECT * FROM auth_codes WHERE email=? AND type='reset' ORDER BY created_at DESC LIMIT 1").bind(email).first<any>();
          if(!row||Number(row.expires_at)<Date.now())return json({error:"الكود انتهت صلاحيته. اطلب كود جديد."},400);
          if(!/^\d{4,10}$/.test(code))return json({error:"اكتب كود التأكيد بشكل صحيح"},400);
          if((await otpHash(email,"reset",code))!==row.code_hash){await env.DB.prepare("UPDATE auth_codes SET attempts=attempts+1 WHERE id=?").bind(row.id).run();return json({error:"كود التأكيد غير صحيح"},400);}
          const u=await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first<any>(); if(!u)return json({error:"لا يوجد حساب بهذا الإيميل"},404);
          const salt=randomHex(16), pass=await hashPassword(password,salt),now=Date.now(); await env.DB.batch([env.DB.prepare("UPDATE users SET password_hash=?,password_salt=?,updated_at=? WHERE id=?").bind(pass,salt,now,u.id),env.DB.prepare("DELETE FROM auth_codes WHERE id=?").bind(row.id)]);
          return json({ok:true});
        }
        if(url.pathname==="/api/auth/register" && request.method==="POST") {
          const b=await body(request), email=cleanEmail(b?.email), name=cleanName(b?.name), password=String(b?.password||""), phone=cleanPhone(b?.phone);
          if(!name||!email||password.length<8||!phone) return json({error:"الاسم والإيميل وكلمة السر (8 أحرف على الأقل) ورقم واتساب مطلوبة"},400);
          const exists=await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first();
          if(exists) return json({error:"الإيميل مستخدم بالفعل"},409);
          if(phone && !validPhone(phone)) return json({error:"رقم واتساب غير صالح"},400);
          if(phone){const phoneExists=await env.DB.prepare("SELECT user_id FROM user_phones WHERE phone=?").bind(phone).first();if(phoneExists)return json({error:"رقم واتساب مستخدم بالفعل"},409);}
          const id=randomHex(16), salt=randomHex(16), pass=await hashPassword(password,salt);
          await env.DB.batch([
            env.DB.prepare("INSERT INTO users(id,email,name,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").bind(id,email,name,pass,salt,Date.now(),Date.now()),
            env.DB.prepare("INSERT INTO user_data(user_id,data_json,updated_at) VALUES(?,?,?)").bind(id,"",Date.now()),
            ...(phone ? [env.DB.prepare("INSERT INTO user_phones(user_id,phone,updated_at) VALUES(?,?,?)").bind(id,phone,Date.now())] : [])
          ]);
          const token=await createSession(id,env);
          return json({user:{id,email,name,phone:phone||null}},200,{"set-cookie":sessionCookie(token)});
        }
        if(url.pathname==="/api/auth/login" && request.method==="POST") {
          const b=await body(request), email=cleanEmail(b?.email), password=String(b?.password||""), phone=cleanPhone(b?.phone);
          const u=await env.DB.prepare("SELECT id,email,name,password_hash,password_salt FROM users WHERE email=?").bind(email).first<any>();
          if(!u||!(await verifyPassword(password,u.password_salt,u.password_hash))) return json({error:"الإيميل أو كلمة السر غير صحيحة"},401);
          if(phone && !validPhone(phone)) return json({error:"رقم واتساب غير صالح"},400);
          if(phone){
            const phoneExists=await env.DB.prepare("SELECT user_id FROM user_phones WHERE phone=? AND user_id<>?").bind(phone,u.id).first<any>();
            if(phoneExists)return json({error:"رقم واتساب مستخدم بالفعل"},409);
            await env.DB.prepare("INSERT INTO user_phones(user_id,phone,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET phone=excluded.phone,updated_at=excluded.updated_at").bind(u.id,phone,Date.now()).run();
          }
          const phoneRow=await env.DB.prepare("SELECT phone FROM user_phones WHERE user_id=?").bind(u.id).first<any>();
          await env.DB.prepare("DELETE FROM sessions WHERE expires_at<=?").bind(Date.now()).run();
          const token=await createSession(u.id,env);
          return json({user:{id:u.id,email:u.email,name:u.name,phone:phoneRow?.phone||null}},200,{"set-cookie":sessionCookie(token)});
        }
        if(url.pathname==="/api/account/whatsapp" && (request.method==="GET"||request.method==="PUT")) {
          const u=await userFrom(request,env); if(!u) return json({error:"يجب تسجيل الدخول"},401);
          if(request.method==="GET") {
            const row=await env.DB.prepare("SELECT phone FROM user_phones WHERE user_id=?").bind(u.id).first<any>();
            return json({phone:row?.phone||""});
          }
          const b=await body(request), phone=cleanPhone(b?.phone);
          if(phone && !validPhone(phone)) return json({error:"رقم واتساب غير صالح"},400);
          if(phone){
            const exists=await env.DB.prepare("SELECT user_id FROM user_phones WHERE phone=? AND user_id<>?").bind(phone,u.id).first();            if(exists)return json({error:"رقم واتساب مستخدم بالفعل"},409);
            await env.DB.prepare("INSERT INTO user_phones(user_id,phone,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET phone=excluded.phone,updated_at=excluded.updated_at").bind(u.id,phone,Date.now()).run();
          } else {
            await env.DB.prepare("DELETE FROM user_phones WHERE user_id=?").bind(u.id).run();
          }
          return json({ok:true,phone});
        }
        if(url.pathname==="/api/auth/me" && request.method==="GET") {
          const u=await userFrom(request,env); if(!u) return json({user:null});
          const row=await env.DB.prepare("SELECT phone FROM user_phones WHERE user_id=?").bind(u.id).first<any>();
          return json({user:{id:u.id,email:u.email,name:u.name,phone:row?.phone||null}});
        }
        if(url.pathname==="/api/account/profile" && (request.method==="GET"||request.method==="PUT")) {
          const u=await userFrom(request,env); if(!u) return json({error:"يجب تسجيل الدخول"},401);
          if(request.method==="GET") {
            const row=await env.DB.prepare("SELECT phone FROM user_phones WHERE user_id=?").bind(u.id).first<any>();
            return json({user:{id:u.id,email:u.email,name:u.name,phone:row?.phone||null}});
          }
          const b=await body(request), name=cleanName(b?.name);
          if(!name) return json({error:"الاسم مطلوب"},400);
          const phone=cleanPhone(b?.phone);
          if(phone && !validPhone(phone)) return json({error:"رقم واتساب غير صالح"},400);
          if(phone){
            const exists=await env.DB.prepare("SELECT user_id FROM user_phones WHERE phone=? AND user_id<>?").bind(phone,u.id).first<any>();
            if(exists)return json({error:"رقم واتساب مستخدم بالفعل"},409);
          }
          await env.DB.prepare("UPDATE users SET name=?,updated_at=? WHERE id=?").bind(name,Date.now(),u.id).run();
          if(phone){
            await env.DB.prepare("INSERT INTO user_phones(user_id,phone,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET phone=excluded.phone,updated_at=excluded.updated_at").bind(u.id,phone,Date.now()).run();
          }else{
            await env.DB.prepare("DELETE FROM user_phones WHERE user_id=?").bind(u.id).run();
          }
          return json({ok:true,user:{id:u.id,email:u.email,name,phone:phone||null}});
        }
        if(url.pathname==="/api/auth/logout" && request.method==="POST") {
          const token=cookieValue(request); if(token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await sha256(token)).run();
          return json({ok:true},200,{"set-cookie":clearCookie()});
        }
        if(url.pathname==="/api/data" && (request.method==="GET"||request.method==="PUT")) {
          const u=await userFrom(request,env); if(!u) return json({error:"يجب تسجيل الدخول"},401);
          if(request.method==="GET") {
            const row=await env.DB.prepare("SELECT data_json,updated_at FROM user_data WHERE user_id=?").bind(u.id).first<any>();
            let parsed:any=null; if(row?.data_json){try{parsed=JSON.parse(row.data_json)}catch{parsed=null}} return json({data:parsed,updatedAt:row?.updated_at||0});
          }
          const b=await body(request); if(!b||typeof b.data!=="object") return json({error:"بيانات غير صالحة"},400);
          const serialized=JSON.stringify(b.data); if(serialized.length>900000) return json({error:"النسخة كبيرة جدًا"},413);
          await env.DB.prepare("UPDATE user_data SET data_json=?,updated_at=? WHERE user_id=?").bind(serialized,Date.now(),u.id).run();
          return json({ok:true,updatedAt:Date.now()});
        }
        return json({error:"Not found"},404);
      } catch(e) {
        console.error("API error", url.pathname, e);
        const message=e instanceof Error ? e.message : String(e);
        if(url.pathname!=="/api/telegram/webhook" && url.pathname!=="/api/health"){
          ctx.waitUntil(sendAdminAlert(env,"❌ خطأ في الخادم","📍 "+url.pathname+"\n⚠️ "+message.slice(0,300),"server_error",5*60*1000));
        }
        return json({error:"حدث خطأ في الخادم",detail:message.slice(0,240)},500);
      }
    }
    if(url.pathname === "/" || url.pathname.includes(".")) return env.ASSETS.fetch(request);
    return new Response("الصفحة غير موجودة", {status:404, headers:{"content-type":"text/plain; charset=utf-8","cache-control":"no-store"}});
  }
};
