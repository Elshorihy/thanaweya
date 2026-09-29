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
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash)").run();
    await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at)").run();
  })().catch(e=>{schemaReady=null;throw e});
  await schemaReady;
}
const COOKIE = "thanaweya_session";
const SESSION_DAYS = 30;

function json(data: unknown, status=200, headers: Record<string,string>={}) {
  return new Response(JSON.stringify(data), {status, headers: {"content-type":"application/json; charset=utf-8", ...headers}});
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
  const url=env.GOOGLE_APPS_SCRIPT_URL;
  const secret=env.GOOGLE_APPS_SCRIPT_SECRET;
  if(!url||!secret) throw new Error("Gmail غير مفعّل حاليًا");

  const r=await fetch(url,{
    method:"POST",
    headers:{"content-type":"application/json","accept":"application/json"},
    body:JSON.stringify({secret,email,code,otpCode:code,type})
  });

  const raw=await r.text();
  let data:any={};
  try { data=JSON.parse(raw); } catch {}

  if(!r.ok) throw new Error("Google Apps Script HTTP "+r.status+(raw?": "+raw.slice(0,180):""));
  if(!data?.ok) throw new Error(String(data?.error||raw||"فشل إرسال الإيميل عبر Gmail").slice(0,240));
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

async function ensureTelegramDashboard(env:Env){
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS telegram_admin_state (chat_id TEXT PRIMARY KEY, mode TEXT NOT NULL, payload_json TEXT, updated_at INTEGER NOT NULL)").run();
  try { await env.DB.prepare("ALTER TABLE telegram_admin_state ADD COLUMN payload_json TEXT").run(); } catch {}
}

function telegramDashboardKeyboard(){
  return {    inline_keyboard:[
      [{text:"📊 الرئيسية والإحصائيات",callback_data:"dash_stats"},{text:"👥 المستخدمين",callback_data:"dash_users"}],
      [{text:"🔎 بحث عن مستخدم",callback_data:"dash_search"},{text:"🕐 آخر المستخدمين",callback_data:"dash_recent"}],
      [{text:"📈 الزيارات",callback_data:"dash_traffic"},{text:"🔐 الدخول و OTP",callback_data:"dash_auth"}],
      [{text:"📱 واتساب",callback_data:"dash_wa"},{text:"🩺 حالة النظام",callback_data:"dash_system"}],
      [{text:"📢 إرسال للجميع",callback_data:"dash_broadcast"}],
      [{text:"🔄 تحديث اللوحة",callback_data:"dash_home"}]
    ]
  };
}
const dashBack=()=>({inline_keyboard:[[ {text:"⬅️ رجوع للوحة",callback_data:"dash_home"} ]]});

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

async function sendTelegramUsers(env:Env,chatId:string){
  const row=await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first<any>();
  const verified=await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE email_verified_at IS NOT NULL").first<any>();
  const whatsapp=await env.DB.prepare("SELECT COUNT(*) AS n FROM user_phones WHERE phone IS NOT NULL AND phone<>''").first<any>();
  const noWhatsapp=Number(row?.n||0)-Number(whatsapp?.n||0);
  const today=await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE created_at>=?").bind(Date.now()-86400000).first<any>();
  const week=await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE created_at>=?").bind(Date.now()-7*86400000).first<any>();
  const text=[
    "👥 تفاصيل المستخدمين",
    "",
    "👤 إجمالي الحسابات: "+Number(row?.n||0).toLocaleString("ar-EG"),
    "✅ حسابات مؤكدة: "+Number(verified?.n||0).toLocaleString("ar-EG"),
    "📱 مربوط لهم واتساب: "+Number(whatsapp?.n||0).toLocaleString("ar-EG"),
    "⚠️ بدون واتساب: "+Math.max(0,noWhatsapp).toLocaleString("ar-EG"),
    "🆕 تسجيلات آخر 24 ساعة: "+Number(today?.n||0).toLocaleString("ar-EG"),
    "🗓️ تسجيلات آخر 7 أيام: "+Number(week?.n||0).toLocaleString("ar-EG")
  ].join("\n");
  await telegramCall(env,"sendMessage",{chat_id:chatId,text,reply_markup:dashBack()});
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
  const text=["🕐 آخر 10 حسابات", "", ...(lines.length?lines:["لا يوجد مستخدمون حتى الآن."])].join("\n");
  await telegramCall(env,"sendMessage",{chat_id:chatId,text,reply_markup:dashBack()});
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
  const text=["🔎 نتائج البحث عن: "+query,"",...(lines.length?lines:["لا توجد نتائج مطابقة."])].join("\n");
  await telegramCall(env,"sendMessage",{chat_id:chatId,text,reply_markup:{inline_keyboard:[[ {text:"🔎 بحث جديد",callback_data:"dash_search"} ],[ {text:"⬅️ رجوع",callback_data:"dash_home"} ]] }});
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

async function handleTelegramUpdate(env:Env,update:any){
  const message=update?.message;
  const callback=update?.callback_query;
  const chatId=String(message?.chat?.id ?? callback?.message?.chat?.id ?? "");
  if(!chatId || chatId!==String(env.TELEGRAM_CHAT_ID)) return;

  if(callback){
    if(callback.id) await telegramCall(env,"answerCallbackQuery",{callback_query_id:callback.id});
    const data=String(callback.data||"");
    if(data==="dash_home"){await clearTelegramAdminMode(env,chatId);await sendTelegramDashboard(env,chatId);return;}
    if(data==="dash_stats"){await sendTelegramDashboard(env,chatId);return;}
    if(data==="dash_users"){await clearTelegramAdminMode(env,chatId);await sendTelegramUsers(env,chatId);return;}
    if(data==="dash_recent"){await clearTelegramAdminMode(env,chatId);await sendTelegramRecentUsers(env,chatId);return;}    if(data==="dash_search"){await setTelegramAdminMode(env,chatId,"user_search");await telegramCall(env,"sendMessage",{chat_id:chatId,text:"🔎 ابعت الاسم أو الإيميل أو رقم الواتساب اللي عايز تدور عليه.",reply_markup:{inline_keyboard:[[ {text:"❌ إلغاء",callback_data:"dash_cancel"} ]] }});return;}
    if(data==="dash_traffic"){await clearTelegramAdminMode(env,chatId);await sendTelegramTraffic(env,chatId);return;}
    if(data==="dash_auth"){await clearTelegramAdminMode(env,chatId);await sendTelegramAuthStats(env,chatId);return;}
    if(data==="dash_wa"){await clearTelegramAdminMode(env,chatId);await sendTelegramWhatsAppStats(env,chatId);return;}
    if(data==="dash_system"){await clearTelegramAdminMode(env,chatId);await sendTelegramSystem(env,chatId);return;}
    if(data==="dash_broadcast"){await setTelegramAdminMode(env,chatId,"broadcast");await telegramCall(env,"sendMessage",{chat_id:chatId,text:"📢 ابعتلي الرسالة اللي عايز تبعتها لكل أرقام واتساب المسجلة.\n\n⚠️ بعد ما تبعتها هعرض عليك تأكيد قبل الإرسال للجميع.",reply_markup:{inline_keyboard:[[ {text:"❌ إلغاء",callback_data:"dash_cancel"} ]] }});return;}
    if(data==="dash_broadcast_confirm"){
      const state=await getTelegramAdminState(env,chatId);
      const pending=String(state.payload?.message||"").trim();
      if(!pending){await clearTelegramAdminMode(env,chatId);await sendTelegramDashboard(env,chatId);return;}
      await clearTelegramAdminMode(env,chatId);
      await telegramCall(env,"sendMessage",{chat_id:chatId,text:"⏳ جاري إرسال الحملة لكل الأرقام..."});
      try{
        const result=await broadcastWhatsApp(env,pending);
        await telegramCall(env,"sendMessage",{chat_id:chatId,text:["📢 نتيجة الحملة","","👥 الإجمالي: "+result.total,"✅ تم الإرسال: "+result.sent,"❌ فشل: "+result.failed,result.errors.length?"\nأمثلة للأخطاء:\n"+result.errors.join("\n"):""].join("\n"),reply_markup:{inline_keyboard:[[ {text:"🎛️ لوحة التحكم",callback_data:"dash_home"} ]] }});
      }catch(e){await telegramCall(env,"sendMessage",{chat_id:chatId,text:"⚠️ تعذر تنفيذ الحملة: "+(e instanceof Error?e.message:String(e)).slice(0,700),reply_markup:{inline_keyboard:[[ {text:"🎛️ لوحة التحكم",callback_data:"dash_home"} ]] }});}
      return;
    }
    if(data==="dash_cancel"){await clearTelegramAdminMode(env,chatId);await sendTelegramDashboard(env,chatId);return;}
    return;
  }

  const text=String(message?.text||"").trim();
  const state=await getTelegramAdminState(env,chatId);
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
        if(request.method==="OPTIONS") return new Response(null,{status:204,headers:{"access-control-allow-origin":url.origin,"access-control-allow-credentials":"true","access-control-allow-methods":"GET,POST,PUT,OPTIONS","access-control-allow-headers":"content-type"}});
        // Owner panel uses one fixed account and its own HttpOnly cookie.
        // It does not create a user/session record and does not depend on the site's normal auth.
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
          ctx.waitUntil((async()=>{
            try {
              await handleTelegramUpdate(env,update);
            } catch(e) {
              console.error("Telegram webhook error",e);
              const chatId=String(update?.message?.chat?.id ?? update?.callback_query?.message?.chat?.id ?? "");
              if(chatId && chatId===String(env.TELEGRAM_CHAT_ID)) {
                try {
                  await telegramCall(env,"sendMessage",{
                    chat_id:chatId,
                    text:"⚠️ حصل خطأ أثناء جلب الإحصائيات. جرّب زر الإحصائيات مرة تانية."
                  });
                } catch(err) {
                  console.error("Telegram error reply failed",err);
                }
              }
            }
          })());
          return json({ok:true});
        }
        if(url.pathname==="/api/health") {
          try { await ensureSchema(env); await env.DB.prepare("SELECT 1 AS ok").first(); return json({ok:true,db:true}); }
          catch(e) { console.error("D1 health check failed",e); return json({ok:false,db:false,error:"D1 binding/database is not available. Check the DB binding in Cloudflare."},503); }
        }
        await ensureSchema(env);
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
          const b=await body(request), email=cleanEmail(b?.email), code=String(b?.code||"").replace(/\\D/g,"").slice(0,6);
          const row=await env.DB.prepare("SELECT * FROM auth_codes WHERE email=? AND type='register' ORDER BY created_at DESC LIMIT 1").bind(email).first<any>();
          if(!row||Number(row.expires_at)<Date.now()) return json({error:"الكود انتهت صلاحيته. اطلب كود جديد."},400);
          if(!/^\\d{4,10}$/.test(code)) return json({error:"اكتب كود التأكيد بشكل صحيح"},400);
          if(Number(row.attempts)>=5) return json({error:"تم تجاوز عدد المحاولات. اطلب كود جديد."},429);
          const ok=(await otpHash(email,"register",code))===row.code_hash;
          if(!ok){await env.DB.prepare("UPDATE auth_codes SET attempts=attempts+1 WHERE id=?").bind(row.id).run();return json({error:"كود التأكيد غير صحيح"},400);}
          const p=JSON.parse(row.payload_json||"{}");
          const exists=await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first(); if(exists){await env.DB.prepare("DELETE FROM auth_codes WHERE id=?").bind(row.id).run();return json({error:"الإيميل مستخدم بالفعل"},409);}
          const id=randomHex(16), now=Date.now();
          await env.DB.batch([env.DB.prepare("INSERT INTO users(id,email,name,password_hash,password_salt,email_verified_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").bind(id,email,p.name,p.password_hash,p.password_salt,now,now,now),env.DB.prepare("INSERT INTO user_data(user_id,data_json,updated_at) VALUES(?,?,?)").bind(id,"",now),...(p.phone?[env.DB.prepare("INSERT INTO user_phones(user_id,phone,updated_at) VALUES(?,?,?)").bind(id,p.phone,now)]:[]),env.DB.prepare("DELETE FROM auth_codes WHERE id=?").bind(row.id)]);
          const token=await createSession(id,env); return json({user:{id,email,name:p.name,phone:p.phone||null}},200,{"set-cookie":sessionCookie(token)});
        }
        if(url.pathname==="/api/auth/forgot/start" && request.method==="POST") {
          const b=await body(request), email=cleanEmail(b?.email), u=await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first<any>();
          if(u){
            const code=generateOtpCode(),now=Date.now();
            await env.DB.prepare("DELETE FROM auth_codes WHERE email=? AND type='reset'").bind(email).run();
            await env.DB.prepare("INSERT INTO auth_codes(id,email,type,code_hash,payload_json,expires_at,attempts,created_at) VALUES(?,?,?,?,?,?,?,?)").bind(randomHex(16),email,"reset",await otpHash(email,"reset",code),null,now+10*60*1000,0,now).run();
            try{await sendEmailOtp(env,email,code,"reset");}catch(e){await env.DB.prepare("DELETE FROM auth_codes WHERE email=? AND type='reset'").bind(email).run();throw e;}}
          return json({ok:true});
        }
        if(url.pathname==="/api/auth/reset" && request.method==="POST") {
          const b=await body(request), email=cleanEmail(b?.email), code=String(b?.code||"").replace(/\\D/g,"").slice(0,6), password=String(b?.password||"");
          if(password.length<8)return json({error:"كلمة السر لازم تكون 8 أحرف على الأقل"},400);
          const row=await env.DB.prepare("SELECT * FROM auth_codes WHERE email=? AND type='reset' ORDER BY created_at DESC LIMIT 1").bind(email).first<any>();
          if(!row||Number(row.expires_at)<Date.now())return json({error:"الكود انتهت صلاحيته. اطلب كود جديد."},400);
          if(!/^\\d{4,10}$/.test(code))return json({error:"اكتب كود التأكيد بشكل صحيح"},400);
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
        return json({error:"حدث خطأ في الخادم",detail:message.slice(0,240)},500);
      }
    }
    if(url.pathname === "/" || url.pathname.includes(".")) return env.ASSETS.fetch(request);
    return new Response("الصفحة غير موجودة", {status:404, headers:{"content-type":"text/plain; charset=utf-8","cache-control":"no-store"}});
  }
};
