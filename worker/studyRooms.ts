type RoomUser = { id: string; name: string; role?: string };
type RoomEnv = { DB: D1Database; TELEGRAM_BOT_TOKEN?: string; TELEGRAM_CHAT_ID?: string };
const roomJson = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const roomId = () => crypto.randomUUID();
const roomCode = () => { const a = new Uint8Array(5); crypto.getRandomValues(a); return Array.from(a, x => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[x % 32]).join(""); };
async function roomBody(req: Request) { try { return await req.json() as Record<string, unknown>; } catch { return {}; } }
async function ensureRoomTables(db: D1Database) {
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS study_rooms (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, title TEXT NOT NULL, subject TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', visibility TEXT NOT NULL DEFAULT 'public', invite_code TEXT UNIQUE, max_members INTEGER NOT NULL DEFAULT 5, is_locked INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS study_room_members (room_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member', joined_at INTEGER NOT NULL, last_seen INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'studying', PRIMARY KEY(room_id,user_id), FOREIGN KEY(room_id) REFERENCES study_rooms(id) ON DELETE CASCADE)"),
    db.prepare("CREATE TABLE IF NOT EXISTS study_room_messages (id TEXT PRIMARY KEY, room_id TEXT NOT NULL, user_id TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL, deleted_at INTEGER, FOREIGN KEY(room_id) REFERENCES study_rooms(id) ON DELETE CASCADE)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_study_room_messages ON study_room_messages(room_id,created_at DESC)"),
    db.prepare("CREATE TABLE IF NOT EXISTS study_room_reports (id TEXT PRIMARY KEY, room_id TEXT NOT NULL, reporter_id TEXT NOT NULL, reported_user_id TEXT NOT NULL, reason TEXT NOT NULL, details TEXT NOT NULL DEFAULT '', evidence_json TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'open', decision TEXT, reviewed_by TEXT, created_at INTEGER NOT NULL, reviewed_at INTEGER, FOREIGN KEY(room_id) REFERENCES study_rooms(id) ON DELETE CASCADE)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_study_room_reports_status ON study_room_reports(status,created_at DESC)"),
    db.prepare("CREATE TABLE IF NOT EXISTS study_room_bans (room_id TEXT NOT NULL, user_id TEXT NOT NULL, banned_by TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, PRIMARY KEY(room_id,user_id))"),
    db.prepare("CREATE TABLE IF NOT EXISTS study_room_signals (id TEXT PRIMARY KEY, room_id TEXT NOT NULL, from_user_id TEXT NOT NULL, to_user_id TEXT NOT NULL, kind TEXT NOT NULL, payload_json TEXT NOT NULL, created_at INTEGER NOT NULL)")
  ]);
}
async function roomMember(db: D1Database, room: string, user: string) {
  return await db.prepare("SELECT role FROM study_room_members WHERE room_id=? AND user_id=?").bind(room,user).first<{role:string}>();
}
export async function handleStudyRooms(request: Request, env: RoomEnv, user: RoomUser): Promise<Response | null> {
  const url=new URL(request.url); if(url.pathname!=="/api/study-rooms") return null;
  const db=env.DB; await ensureRoomTables(db); const now=Date.now();
  const b=request.method==="POST"?await roomBody(request):{};
  const action=String(b.action||url.searchParams.get("action")||"list");
  const room=String(b.roomId||url.searchParams.get("roomId")||"").slice(0,80);
  const fail=(message:string,status=400)=>roomJson({error:message},status);
  if(action==="list"&&request.method==="GET"){
    const rows=await db.prepare("SELECT r.id,r.owner_id AS ownerId,u.name AS ownerName,r.title,r.subject,r.description,r.visibility,r.max_members AS maxMembers,r.is_locked AS isLocked,r.created_at AS createdAt,(SELECT COUNT(*) FROM study_room_members m WHERE m.room_id=r.id AND m.last_seen>?) AS members,(SELECT role FROM study_room_members m WHERE m.room_id=r.id AND m.user_id=?) AS myRole FROM study_rooms r JOIN users u ON u.id=r.owner_id WHERE (r.visibility='public' OR EXISTS(SELECT 1 FROM study_room_members x WHERE x.room_id=r.id AND x.user_id=?)) AND NOT EXISTS(SELECT 1 FROM study_room_bans z WHERE z.room_id=r.id AND z.user_id=?) ORDER BY r.updated_at DESC LIMIT 60").bind(now-45000,user.id,user.id,user.id).all<any>();
    return roomJson({rooms:rows.results||[]});
  }
  if(action==="create"&&request.method==="POST"){
    const title=String(b.title||"").trim().slice(0,70),subject=String(b.subject||"عام").trim().slice(0,40),description=String(b.description||"").trim().slice(0,240),visibility=String(b.visibility||"public");
    if(title.length<3)return fail("اسم الغرفة لازم يكون 3 أحرف على الأقل");
    if(!["public","private","hidden"].includes(visibility))return fail("نوع الغرفة غير صالح");
    const id=roomId(),code=visibility==="public"?null:roomCode();
    await db.prepare("INSERT INTO study_rooms(id,owner_id,title,subject,description,visibility,invite_code,max_members,is_locked,created_at,updated_at) VALUES(?,?,?,?,?,?,?,5,0,?,?)").bind(id,user.id,title,subject,description,visibility,code,now,now).run();
    await db.prepare("INSERT INTO study_room_members(room_id,user_id,role,joined_at,last_seen,status) VALUES(?,?, 'owner',?,?, 'studying')").bind(id,user.id,now,now).run();
    return roomJson({ok:true,roomId:id,inviteCode:code});
  }
  if(action==="join"&&request.method==="POST"){
    const code=String(b.code||"").trim().toUpperCase().slice(0,16);
    const target=await db.prepare("SELECT id,visibility,is_locked FROM study_rooms WHERE id=? OR invite_code=?").bind(room,code).first<any>();
    if(!target)return fail("الغرفة غير موجودة أو كود الدعوة غير صحيح",404);
    if(await db.prepare("SELECT 1 FROM study_room_bans WHERE room_id=? AND user_id=?").bind(target.id,user.id).first())return fail("تم منعك من دخول هذه الغرفة",403);
    if(Number(target.is_locked))return fail("الغرفة مقفولة حاليًا",403);
    const exists=await db.prepare("SELECT 1 FROM study_room_members WHERE room_id=? AND user_id=?").bind(target.id,user.id).first();
    if(!exists){
      const count=await db.prepare("SELECT COUNT(*) n FROM study_room_members WHERE room_id=? AND last_seen>?").bind(target.id,now-45000).first<any>();
      if(Number(count?.n||0)>=5)return fail("الغرفة مكتملة (5 طلاب)",409);
      if(target.visibility!=="public"&&!code)return fail("الغرفة خاصة. استخدم كود الدعوة",403);
      await db.prepare("INSERT INTO study_room_members(room_id,user_id,role,joined_at,last_seen,status) VALUES(?,?, 'member',?,?, 'studying')").bind(target.id,user.id,now,now).run();
    }
    await db.prepare("UPDATE study_rooms SET updated_at=? WHERE id=?").bind(now,target.id).run();
    return roomJson({ok:true,roomId:target.id});
  }
  if(action==="leave"&&request.method==="POST"){
    const m=await roomMember(db,room,user.id);if(!m)return fail("أنت مش في الغرفة",403);
    if(m.role==="owner"){
      const next=await db.prepare("SELECT user_id FROM study_room_members WHERE room_id=? AND user_id<>? ORDER BY joined_at LIMIT 1").bind(room,user.id).first<any>();
      if(next)await db.prepare("UPDATE study_room_members SET role='owner' WHERE room_id=? AND user_id=?").bind(room,next.user_id).run();
      else await db.prepare("DELETE FROM study_rooms WHERE id=?").bind(room).run();
    }
    await db.prepare("DELETE FROM study_room_members WHERE room_id=? AND user_id=?").bind(room,user.id).run();return roomJson({ok:true});
  }
  if(action==="send"&&request.method==="POST"){
    if(!await roomMember(db,room,user.id))return fail("انضم للغرفة أولًا",403);
    const content=String(b.content||"").trim().slice(0,500);if(!content)return fail("اكتب رسالة الأول");
    const recent=await db.prepare("SELECT COUNT(*) n FROM study_room_messages WHERE room_id=? AND user_id=? AND created_at>?").bind(room,user.id,now-10000).first<any>();
    if(Number(recent?.n||0)>=8)return fail("استنى شوية قبل إرسال رسائل جديدة",429);
    const id=roomId();await db.prepare("INSERT INTO study_room_messages(id,room_id,user_id,content,created_at) VALUES(?,?,?,?,?)").bind(id,room,user.id,content,now).run();
    await db.prepare("UPDATE study_room_members SET last_seen=? WHERE room_id=? AND user_id=?").bind(now,room,user.id).run();
    await db.prepare("UPDATE study_rooms SET updated_at=? WHERE id=?").bind(now,room).run();return roomJson({ok:true,id,createdAt:now});
  }
  if(action==="sync"&&request.method==="GET"){
    if(!await roomMember(db,room,user.id))return fail("انتهت عضويتك في الغرفة",403);
    await db.prepare("UPDATE study_room_members SET last_seen=? WHERE room_id=? AND user_id=?").bind(now,room,user.id).run();
    const info=await db.prepare("SELECT id,owner_id AS ownerId,title,subject,description,visibility,is_locked AS isLocked FROM study_rooms WHERE id=?").bind(room).first<any>();
    const members=await db.prepare("SELECT m.user_id AS id,u.name,m.role,m.status,m.last_seen AS lastSeen FROM study_room_members m JOIN users u ON u.id=m.user_id WHERE m.room_id=? AND m.last_seen>? ORDER BY m.joined_at").bind(room,now-45000).all<any>();
    const messages=await db.prepare("SELECT x.id,x.user_id AS userId,u.name,x.content,x.created_at AS createdAt FROM study_room_messages x JOIN users u ON u.id=x.user_id WHERE x.room_id=? AND x.deleted_at IS NULL ORDER BY x.created_at DESC LIMIT 80").bind(room).all<any>();
    const signals=await db.prepare("SELECT id,from_user_id AS fromUserId,kind,payload_json AS payload FROM study_room_signals WHERE room_id=? AND to_user_id=? AND created_at>? ORDER BY created_at LIMIT 20").bind(room,user.id,now-60000).all<any>();
    for(const sig of signals.results||[])await db.prepare("DELETE FROM study_room_signals WHERE id=?").bind(sig.id).run();
    return roomJson({room:info,members:members.results||[],messages:(messages.results||[]).reverse(),signals:(signals.results||[]).map((x:any)=>({...x,payload:JSON.parse(x.payload||"{}")}))});
  }
  if(action==="signal"&&request.method==="POST"){
    if(!await roomMember(db,room,user.id))return fail("انضم للغرفة أولًا",403);
    const to=String(b.toUserId||"").slice(0,80),kind=String(b.kind||"");
    if(!["offer","answer","candidate"].includes(kind)||to===user.id||!await roomMember(db,room,to))return fail("إشارة اتصال غير صالحة");
    const payload=JSON.stringify(b.payload||{});if(payload.length>12000)return fail("بيانات الاتصال كبيرة جدًا");
    await db.prepare("INSERT INTO study_room_signals(id,room_id,from_user_id,to_user_id,kind,payload_json,created_at) VALUES(?,?,?,?,?,?,?)").bind(roomId(),room,user.id,to,kind,payload,now).run();return roomJson({ok:true});
  }
  if(action==="report"&&request.method==="POST"){
    if(!await roomMember(db,room,user.id))return fail("انضم للغرفة أولًا",403);
    const target=String(b.reportedUserId||"").slice(0,80),reason=String(b.reason||"").slice(0,60),details=String(b.details||"").trim().slice(0,1000);
    if(!target||target===user.id||!await roomMember(db,room,target))return fail("اختار عضوًا صحيحًا للإبلاغ عنه");
    if(!["إساءة أو تنمر","محتوى غير لائق","تحرش أو مضايقات","سبام أو إزعاج","مخالفة أخرى"].includes(reason))return fail("سبب البلاغ غير صالح");
    const ids=Array.isArray(b.evidenceIds)?b.evidenceIds.slice(0,8).map(String):[];
    const placeholders=ids.map(()=>"?").join(",");
    const evidence=ids.length?await db.prepare("SELECT x.id,x.user_id AS userId,u.name,x.content,x.created_at AS createdAt FROM study_room_messages x JOIN users u ON u.id=x.user_id WHERE x.room_id=? AND x.id IN ("+placeholders+") ORDER BY x.created_at").bind(room,...ids).all<any>():{results:[]};
    const reportId=roomId();await db.prepare("INSERT INTO study_room_reports(id,room_id,reporter_id,reported_user_id,reason,details,evidence_json,created_at) VALUES(?,?,?,?,?,?,?,?)").bind(reportId,room,user.id,target,reason,details,JSON.stringify(evidence.results||[]),now).run();
    if(env.TELEGRAM_BOT_TOKEN&&env.TELEGRAM_CHAT_ID){try{await fetch("https://api.telegram.org/bot"+env.TELEGRAM_BOT_TOKEN+"/sendMessage",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({chat_id:env.TELEGRAM_CHAT_ID,text:"🚨 بلاغ جديد في غرف مذاكرة ثانوية\nرقم البلاغ: "+reportId+"\nالسبب: "+reason+"\nالغرفة: "+room+"\nراجع البلاغات من لوحة ثانوية."})})}catch{}}
    return roomJson({ok:true,reportId});
  }
  if(action==="reports"&&request.method==="GET"){
    if(user.role!=="owner")return fail("غير مصرح",403);
    const rows=await db.prepare("SELECT r.id,r.room_id AS roomId,r.reporter_id AS reporterId,ru.name AS reporterName,r.reported_user_id AS reportedUserId,bu.name AS reportedName,r.reason,r.details,r.evidence_json AS evidence,r.status,r.decision,r.created_at AS createdAt FROM study_room_reports r JOIN users ru ON ru.id=r.reporter_id JOIN users bu ON bu.id=r.reported_user_id ORDER BY CASE r.status WHEN 'open' THEN 0 ELSE 1 END,r.created_at DESC LIMIT 100").all<any>();
    return roomJson({reports:(rows.results||[]).map((x:any)=>({...x,evidence:JSON.parse(x.evidence||"[]")}))});
  }
  if(action==="moderate"&&request.method==="POST"){
    if(user.role!=="owner")return fail("غير مصرح",403);
    const reportId=String(b.reportId||"").slice(0,80),decision=String(b.decision||"");
    if(!["dismiss","mute","ban","resolve"].includes(decision))return fail("قرار غير صالح");
    const r=await db.prepare("SELECT id,room_id,reported_user_id FROM study_room_reports WHERE id=?").bind(reportId).first<any>();if(!r)return fail("البلاغ غير موجود",404);
    if(decision==="ban")await db.prepare("INSERT OR REPLACE INTO study_room_bans(room_id,user_id,banned_by,reason,created_at) VALUES(?,?,?,?,?)").bind(r.room_id,r.reported_user_id,user.id,"قرار إداري بعد مراجعة بلاغ",now).run();
    if(decision==="mute")await db.prepare("UPDATE study_room_members SET status='muted' WHERE room_id=? AND user_id=?").bind(r.room_id,r.reported_user_id).run();
    await db.prepare("UPDATE study_room_reports SET status=?,decision=?,reviewed_by=?,reviewed_at=? WHERE id=?").bind(decision==="dismiss"?"dismissed":"resolved",decision,user.id,now,reportId).run();return roomJson({ok:true});
  }
  return fail("إجراء غير معروف",404);
}
