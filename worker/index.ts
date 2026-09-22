interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

let schemaReady:Promise<void>|null=null;
async function ensureSchema(env:Env){
  if(!schemaReady) schemaReady=env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,name TEXT NOT NULL,password_hash TEXT NOT NULL,password_salt TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS user_data (user_id TEXT PRIMARY KEY,data_json TEXT NOT NULL DEFAULT '',updated_at INTEGER NOT NULL,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)")
  ]).then(()=>undefined).catch(e=>{schemaReady=null;throw e});
  await schemaReady;
}
const COOKIE = "thanaweya_session";
const SESSION_DAYS = 30;

function json(data: unknown, status=200, headers: Record<string,string>={}) {
  return new Response(JSON.stringify(data), {status, headers: {"content-type":"application/json; charset=utf-8", ...headers}});
}
function cleanEmail(v: unknown) { return String(v ?? "").trim().toLowerCase().slice(0,160); }
function cleanName(v: unknown) { return String(v ?? "").trim().replace(/[<>]/g,"").slice(0,80); }
function bytesToHex(bytes: Uint8Array) { return [...bytes].map(b=>b.toString(16).padStart(2,"0")).join(""); }
function randomHex(n=32) { const a=new Uint8Array(n); crypto.getRandomValues(a); return bytesToHex(a); }
async function sha256(value:string) {
  const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(b));
}
async function hashPassword(password:string,salt:string) {
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]);
  const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt:new TextEncoder().encode(salt),iterations:120000,hash:"SHA-256"},key,256);
  return bytesToHex(new Uint8Array(bits));
}
async function verifyPassword(password:string,salt:string,hash:string) {
  return (await hashPassword(password,salt))===hash;
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

export default {
  async fetch(request:Request,env:Env):Promise<Response> {
    const url=new URL(request.url);
    if(url.pathname.startsWith("/api/")) {
      try {
        if(request.method==="OPTIONS") return new Response(null,{status:204,headers:{"access-control-allow-origin":url.origin,"access-control-allow-credentials":"true","access-control-allow-methods":"GET,POST,PUT,OPTIONS","access-control-allow-headers":"content-type"}});
        if(url.pathname==="/api/health") {
          try { await ensureSchema(env); await env.DB.prepare("SELECT 1 AS ok").first(); return json({ok:true,db:true}); }
          catch(e) { console.error("D1 health check failed",e); return json({ok:false,db:false,error:"D1 binding/database is not available. Check the DB binding in Cloudflare."},503); }
        }
        await ensureSchema(env);
        if(url.pathname==="/api/auth/register" && request.method==="POST") {
          const b=await body(request), email=cleanEmail(b?.email), name=cleanName(b?.name), password=String(b?.password||"");
          if(!name||!email||password.length<8) return json({error:"الاسم والإيميل وكلمة السر (8 أحرف على الأقل) مطلوبة"},400);
          const exists=await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first();
          if(exists) return json({error:"الإيميل مستخدم بالفعل"},409);
          const id=randomHex(16), salt=randomHex(16), pass=await hashPassword(password,salt);
          await env.DB.batch([
            env.DB.prepare("INSERT INTO users(id,email,name,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").bind(id,email,name,pass,salt,Date.now(),Date.now()),
            env.DB.prepare("INSERT INTO user_data(user_id,data_json,updated_at) VALUES(?,?,?)").bind(id,"",Date.now())
          ]);
          const token=await createSession(id,env);
          return json({user:{id,email,name}},{headers:{"set-cookie":sessionCookie(token)}});
        }
        if(url.pathname==="/api/auth/login" && request.method==="POST") {
          const b=await body(request), email=cleanEmail(b?.email), password=String(b?.password||"");
          const u=await env.DB.prepare("SELECT id,email,name,password_hash,password_salt FROM users WHERE email=?").bind(email).first<any>();
          if(!u||!(await verifyPassword(password,u.password_salt,u.password_hash))) return json({error:"الإيميل أو كلمة السر غير صحيحة"},401);
          await env.DB.prepare("DELETE FROM sessions WHERE expires_at<=?").bind(Date.now()).run();
          const token=await createSession(u.id,env);
          return json({user:{id:u.id,email:u.email,name:u.name}},{headers:{"set-cookie":sessionCookie(token)}});
        }
        if(url.pathname==="/api/auth/me" && request.method==="GET") {
          const u=await userFrom(request,env); return json({user:u?{id:u.id,email:u.email,name:u.name}:null});
        }
        if(url.pathname==="/api/auth/logout" && request.method==="POST") {
          const token=cookieValue(request); if(token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await sha256(token)).run();
          return json({ok:true},{headers:{"set-cookie":clearCookie()}});
        }
        if(url.pathname==="/api/data" && (request.method==="GET"||request.method==="PUT")) {
          const u=await userFrom(request,env); if(!u) return json({error:"يجب تسجيل الدخول"},401);
          if(request.method==="GET") {
            const row=await env.DB.prepare("SELECT data_json,updated_at FROM user_data WHERE user_id=?").bind(u.id).first<any>();
            return json({data:row?.data_json?JSON.parse(row.data_json):null,updatedAt:row?.updated_at||0});
          }
          const b=await body(request); if(!b||typeof b.data!=="object") return json({error:"بيانات غير صالحة"},400);
          const serialized=JSON.stringify(b.data); if(serialized.length>900000) return json({error:"النسخة كبيرة جدًا"},413);
          await env.DB.prepare("UPDATE user_data SET data_json=?,updated_at=? WHERE user_id=?").bind(serialized,Date.now(),u.id).run();
          return json({ok:true,updatedAt:Date.now()});
        }
        return json({error:"Not found"},404);
      } catch(e) {
        return json({error:"حدث خطأ في الخادم"},500);
      }
    }
    return env.ASSETS.fetch(request);
  }
};
