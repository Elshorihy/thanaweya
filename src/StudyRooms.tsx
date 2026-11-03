import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Users,Plus,Lock,EyeOff,Globe2,Timer,Play,Pause,Send,Flag,LogOut,X,Mic,MicOff,ShieldCheck,Crown,RefreshCw,DoorOpen,MessageCircle,Volume2,AlertTriangle} from 'lucide-react';

type Auth={id:string;name:string};
type Room={id:string;title:string;subject:string;description:string;visibility:'public'|'private'|'hidden';ownerId:string;ownerName:string;memberCount:number;isMember:boolean};
type Member={user_id:string;name:string;joined_at:number};
type ChatMessage={id:string;user_id:string;name:string;content:string;created_at:number};
type TimerState={running:boolean;duration:number;startedAt:number;endsAt:number};
const emptyTimer:TimerState={running:false,duration:0,startedAt:0,endsAt:0};
const reasons=['إساءة أو تنمر','مضايقة أو تنمر','رسائل مزعجة','سلوك غير مناسب','مخالفة أخرى'];

export default function StudyRooms({auth,notify}:{auth:Auth;notify:(message:string)=>void}){
 const [rooms,setRooms]=useState<Room[]>([]),[loading,setLoading]=useState(true),[activeRoom,setActiveRoom]=useState<Room|null>(null);
 const [title,setTitle]=useState(''),[subject,setSubject]=useState('عام'),[description,setDescription]=useState(''),[visibility,setVisibility]=useState<'public'|'private'|'hidden'>('public'),[showCreate,setShowCreate]=useState(false);
 const [joinTarget,setJoinTarget]=useState<Room|null>(null),[inviteCode,setInviteCode]=useState(''),[roomCode,setRoomCode]=useState('');
 const [members,setMembers]=useState<Member[]>([]),[messages,setMessages]=useState<ChatMessage[]>([]),[draft,setDraft]=useState(''),[timer,setTimer]=useState<TimerState>(emptyTimer),[duration,setDuration]=useState(25),[remaining,setRemaining]=useState(0);
 const [reportTarget,setReportTarget]=useState<Member|null>(null),[reportReason,setReportReason]=useState(reasons[0]),[reportDetails,setReportDetails]=useState('');
 const [socketState,setSocketState]=useState<'connecting'|'connected'|'offline'>('offline'),[micOn,setMicOn]=useState(false),[voiceBusy,setVoiceBusy]=useState(false),[micMembers,setMicMembers]=useState<Record<string,boolean>>({});
 const wsRef=useRef<WebSocket|null>(null),makingOfferRef=useRef<Map<string,boolean>>(new Map()),leavingRef=useRef(false),reconnectRef=useRef<number|null>(null),retryRef=useRef(0),inviteRef=useRef(''),roomRef=useRef<Room|null>(null),localStreamRef=useRef<MediaStream|null>(null),peersRef=useRef<Map<string,RTCPeerConnection>>(new Map()),audioRef=useRef<Map<string,HTMLAudioElement>>(new Map()),micStateRef=useRef(false),membersRef=useRef<Member[]>([]),heartbeatRef=useRef<number|null>(null);
 const api=async(path:string,method='GET',data?:Record<string,unknown>)=>{const r=await fetch(path,{method,credentials:'same-origin',cache:'no-store',headers:method==='GET'?undefined:{'content-type':'application/json'},body:data?JSON.stringify(data):undefined});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'حصل خطأ في الاتصال');return j};
 const loadRooms=useCallback(async()=>{setLoading(true);try{const j=await api('/api/study-rooms');setRooms(j.rooms||[])}catch(e){notify(e instanceof Error?e.message:'تعذر تحميل الغرف')}finally{setLoading(false)}},[]);
 useEffect(()=>{void loadRooms()},[loadRooms]);
 useEffect(()=>{roomRef.current=activeRoom},[activeRoom]);
 useEffect(()=>{membersRef.current=members},[members]);
 useEffect(()=>{micStateRef.current=micOn},[micOn]);
 useEffect(()=>{if(!timer.running){setRemaining(timer.duration*60);return}const tick=()=>setRemaining(Math.max(0,Math.ceil((timer.endsAt-Date.now())/1000)));tick();const id=window.setInterval(tick,500);return()=>window.clearInterval(id)},[timer]);
 const send=(value:unknown)=>{const ws=wsRef.current;if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify(value))};
 const closePeers=()=>{for(const pc of peersRef.current.values())try{pc.close()}catch{}peersRef.current.clear();for(const audio of audioRef.current.values()){audio.pause();audio.srcObject=null}audioRef.current.clear()};
 const stopLocalAudio=()=>{localStreamRef.current?.getTracks().forEach(t=>t.stop());localStreamRef.current=null;closePeers();setMicOn(false);micStateRef.current=false;send({type:'mic',enabled:false})};
 const sendSignal=(target:string,payload:unknown)=>send({type:'signal',target,payload});
 const getPeer=(peerId:string)=>{
  let pc=peersRef.current.get(peerId);if(pc){if(localStreamRef.current)localStreamRef.current.getTracks().forEach(track=>{if(!pc!.getSenders().some(sender=>sender.track===track))pc!.addTrack(track,localStreamRef.current!)});return pc;}
  pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}],iceCandidatePoolSize:2});
  peersRef.current.set(peerId,pc);
  if(localStreamRef.current)localStreamRef.current.getTracks().forEach(track=>pc!.addTrack(track,localStreamRef.current!));
  pc.onicecandidate=e=>{if(e.candidate)sendSignal(peerId,{candidate:e.candidate})};
  pc.ontrack=e=>{let audio=audioRef.current.get(peerId);if(!audio){audio=new Audio();audio.autoplay=true;audioRef.current.set(peerId,audio)}audio.srcObject=e.streams[0];void audio.play().catch(()=>{})};
  pc.onconnectionstatechange=()=>{if(pc&&(pc.connectionState==='failed'||pc.connectionState==='closed')){pc.close();peersRef.current.delete(peerId);const a=audioRef.current.get(peerId);if(a){a.pause();a.srcObject=null;audioRef.current.delete(peerId)}}};
  pc.onnegotiationneeded=async()=>{try{if(pc!.signalingState!=='stable')return;makingOfferRef.current.set(peerId,true);await pc!.setLocalDescription();sendSignal(peerId,{description:pc!.localDescription})}catch{}finally{makingOfferRef.current.set(peerId,false)}};
  return pc;
 };
 const handleSignal=async(from:string,payload:any)=>{
  const pc=getPeer(from);
  try{
   if(payload?.description){
    const description=payload.description;
    const polite=auth.id.localeCompare(from)>0;
    const offerCollision=description.type==='offer'&&(makingOfferRef.current.get(from)===true||pc.signalingState!=='stable');
    if(offerCollision&&!polite)return;
    if(offerCollision&&polite){try{await pc.setLocalDescription({type:'rollback'})}catch{}}
    await pc.setRemoteDescription(description);
    if(description.type==='offer'){await pc.setLocalDescription();sendSignal(from,{description:pc.localDescription})}
   }else if(payload?.candidate){try{await pc.addIceCandidate(payload.candidate)}catch{}}
  }catch{}
 };
 const applyPresence=(next:Member[])=>{
  setMembers(next||[]);
  const ids=new Set((next||[]).map(x=>x.user_id));
  for(const [id,pc] of peersRef.current){if(!ids.has(id)){pc.close();peersRef.current.delete(id);const a=audioRef.current.get(id);if(a){a.pause();a.srcObject=null;audioRef.current.delete(id)}}}
  if(localStreamRef.current){for(const m of next||[])if(m.user_id!==auth.id)getPeer(m.user_id)}
 };
 const connectSocket=useCallback((room:Room)=>{
  const protocol=location.protocol==='https:'?'wss:':'ws:';
  const ws=new WebSocket(protocol+'//'+location.host+'/api/study-rooms/'+encodeURIComponent(room.id)+'/live');
  wsRef.current=ws;setSocketState('connecting');
  ws.onopen=()=>{retryRef.current=0;setSocketState('connected');if(heartbeatRef.current!==null)window.clearInterval(heartbeatRef.current);heartbeatRef.current=window.setInterval(()=>send({type:'heartbeat'}),25000);if(micStateRef.current)send({type:'mic',enabled:true})};
  ws.onmessage=event=>{let data:any;try{data=JSON.parse(String(event.data))}catch{return}
   if(data.type==='hello'){applyPresence(data.members||[]);setMessages(data.messages||[]);setTimer(data.timer||emptyTimer)}
   else if(data.type==='presence')applyPresence(data.members||[]);
   else if(data.type==='chat')setMessages(old=>[...old,data.message].slice(-100));
   else if(Array.isArray(data.messages))setMessages(data.messages.slice(-100));
   else if(data.type==='timer')setTimer(data.timer||emptyTimer);
   else if(data.type==='mic'){setMicMembers(old=>({...old,[data.userId]:!!data.enabled}));if(!data.enabled){const pc=peersRef.current.get(data.userId);pc?.close();peersRef.current.delete(data.userId);const audio=audioRef.current.get(data.userId);if(audio){audio.pause();audio.srcObject=null;audioRef.current.delete(data.userId)}if(localStreamRef.current)getPeer(data.userId)}else if(localStreamRef.current)getPeer(data.userId)}
   else if(data.type==='signal')void handleSignal(data.from,data.payload);
   else if(data.type==='notice')notify(data.message||'تنبيه من الغرفة');
   else if(data.type==='room_closed'){leavingRef.current=true;stopLocalAudio();setActiveRoom(null);setSocketState('offline');notify('تم إغلاق الغرفة من صاحبها.');void loadRooms()}
  };
  ws.onclose=()=>{if(heartbeatRef.current!==null){window.clearInterval(heartbeatRef.current);heartbeatRef.current=null}if(wsRef.current===ws)wsRef.current=null;if(leavingRef.current)return;setSocketState('offline');const delay=Math.min(12000,1000*Math.pow(2,Math.min(retryRef.current++,4)));reconnectRef.current=window.setTimeout(async()=>{const current=roomRef.current;if(!current||leavingRef.current)return;try{await api('/api/study-rooms/'+encodeURIComponent(current.id),'POST',{action:'join',inviteCode:inviteRef.current});connectSocket(current)}catch{setSocketState('offline')}},delay)};
  ws.onerror=()=>setSocketState('offline');
 },[auth.id,loadRooms]);
 useEffect(()=>{
  if(!activeRoom)return;
  let cancelled=false;leavingRef.current=false;
  (async()=>{try{const j=await api('/api/study-rooms/'+encodeURIComponent(activeRoom.id)+'/messages');if(!cancelled){setMessages(j.messages||[]);applyPresence(j.members||[])}}catch(e){if(!cancelled)notify(e instanceof Error?e.message:'تعذر تحميل رسائل الغرفة')}if(!cancelled)connectSocket(activeRoom)})();
  return()=>{cancelled=true;leavingRef.current=true;if(reconnectRef.current!==null)window.clearTimeout(reconnectRef.current);if(heartbeatRef.current!==null){window.clearInterval(heartbeatRef.current);heartbeatRef.current=null}stopLocalAudio();const ws=wsRef.current;wsRef.current=null;try{ws?.close()}catch{};void api('/api/study-rooms/'+encodeURIComponent(activeRoom.id),'POST',{action:'leave'}).catch(()=>{})};
 },[activeRoom?.id]);
 const createRoom=async()=>{
  if(title.trim().length<3){notify('اكتب اسمًا واضحًا للغرفة');return}
  try{const j=await api('/api/study-rooms','POST',{action:'create',title,subject,description,visibility});setShowCreate(false);setTitle('');setDescription('');inviteRef.current=j.inviteCode||'';setRoomCode(j.inviteCode||'');setActiveRoom(j.room);await loadRooms();if(j.inviteCode)notify('تم إنشاء الغرفة. احتفظ بكود الدعوة وشاركه مع من تريد.')}catch(e){notify(e instanceof Error?e.message:'تعذر إنشاء الغرفة')}
 };
 const joinRoom=async(room:Room,code='')=>{
  try{await api('/api/study-rooms/'+encodeURIComponent(room.id),'POST',{action:'join',inviteCode:code});inviteRef.current=code;setJoinTarget(null);setInviteCode('');setActiveRoom(room);await loadRooms()}catch(e){notify(e instanceof Error?e.message:'تعذر الانضمام للغرفة')}
 };
 const leaveRoom=async()=>{if(!activeRoom)return;leavingRef.current=true;if(reconnectRef.current!==null)window.clearTimeout(reconnectRef.current);if(heartbeatRef.current!==null){window.clearInterval(heartbeatRef.current);heartbeatRef.current=null}stopLocalAudio();try{await api('/api/study-rooms/'+encodeURIComponent(activeRoom.id),'POST',{action:'leave'})}catch{};try{wsRef.current?.close()}catch{};wsRef.current=null;setActiveRoom(null);setMessages([]);setMembers([]);setTimer(emptyTimer);setSocketState('offline');await loadRooms()};
 const closeRoom=async()=>{if(!activeRoom||activeRoom.ownerId!==auth.id)return;if(!window.confirm('تقفل الغرفة وتنهي الجلسة لكل الموجودين؟'))return;try{await api('/api/study-rooms/'+encodeURIComponent(activeRoom.id),'POST',{action:'close'});leavingRef.current=true;if(heartbeatRef.current!==null){window.clearInterval(heartbeatRef.current);heartbeatRef.current=null}stopLocalAudio();wsRef.current?.close();wsRef.current=null;setActiveRoom(null);notify('تم إغلاق الغرفة.');await loadRooms()}catch(e){notify(e instanceof Error?e.message:'تعذر إغلاق الغرفة')}};
 const sendChat=()=>{const content=draft.trim().slice(0,500);if(!content)return;send({type:'chat',content});setDraft('')};
 const toggleMic=async()=>{
  if(voiceBusy)return;setVoiceBusy(true);
  try{
   if(localStreamRef.current){stopLocalAudio();return}
   if(!navigator.mediaDevices?.getUserMedia)throw new Error('المتصفح لا يدعم تشغيل المايك هنا.');
   const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
   localStreamRef.current=stream;
   for(const member of membersRef.current){if(member.user_id!==auth.id)getPeer(member.user_id)}
   setMicOn(true);micStateRef.current=true;send({type:'mic',enabled:true});
   notify('المايك مفتوح. تقدر تقفله في أي وقت.');
  }catch(e){notify(e instanceof Error?e.message:'تعذر تشغيل المايك. راجع إذن الميكروفون.')}
  finally{setVoiceBusy(false)}
 };
 const submitReport=async()=>{
  if(!activeRoom||!reportTarget)return;
  try{await api('/api/study-rooms/'+encodeURIComponent(activeRoom.id)+'/report','POST',{targetUserId:reportTarget.user_id,reason:reportReason,details:reportDetails});setReportTarget(null);setReportDetails('');notify('وصل البلاغ للإدارة مع مقتطفات الدردشة وقت الإبلاغ. لا يتم تسجيل الصوت.')}catch(e){notify(e instanceof Error?e.message:'تعذر إرسال البلاغ')}
 };
 const startTimer=()=>send({type:'timer',action:'start',duration});
 const pauseTimer=()=>send({type:'timer',action:'pause'});
 const formatTime=(n:number)=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
 const visibilityLabel=(v:string)=>v==='public'?'عامة':v==='private'?'خاصة':'مخفية';
 const VisibilityIcon=({value}:{value:string})=>value==='public'?<Globe2 size={15}/>:value==='private'?<Lock size={15}/>:<EyeOff size={15}/>;

 return <section className="studyRoomsPage" dir="rtl">
  {!activeRoom?<><div className="studyRoomsHero"><div className="studyRoomsHeroIcon"><Users size={28}/></div><div><span className="studyRoomsEyebrow">THANOWEYA STUDY ROOMS</span><h1>غرف المذاكرة</h1><p>ذاكروا مع بعض في مجموعات صغيرة — 5 طلاب كحد أقصى لكل غرفة.</p></div><button className="studyRoomsCreate" onClick={()=>setShowCreate(true)}><Plus size={18}/> إنشاء غرفة</button></div>
   <div className="studyRoomsNotice"><ShieldCheck size={18}/><span>الدردشة نصية وصوت اختياري. لا يتم تسجيل الصوت. الرسائل النصية تُحتفظ مؤقتًا حتى 24 ساعة وبحد أقصى 100 رسالة للغرفة، ويُرفق بالبلاغ آخر 40 رسالة.</span></div>
   {loading?<div className="studyRoomsEmpty">بنحمّل الغرف...</div>:rooms.length?<div className="studyRoomsGrid">{rooms.map(room=><article className="studyRoomCard" key={room.id}><div className="studyRoomCardTop"><span className={'studyRoomVisibility '+room.visibility}><VisibilityIcon value={room.visibility}/>{visibilityLabel(room.visibility)}</span><span className="studyRoomSeats"><Users size={14}/>{room.memberCount}/5</span></div><h3>{room.title}</h3><p>{room.description||'جلسة مذاكرة جماعية'}</p><div className="studyRoomMeta"><span>{room.subject}</span><span>بواسطة {room.ownerName}</span></div><button className="studyRoomJoin" disabled={room.memberCount>=5&&!room.isMember} onClick={()=>room.isMember?joinRoom(room):room.visibility==='public'?joinRoom(room):setJoinTarget(room)}>{room.isMember?'العودة للغرفة':room.memberCount>=5?'الغرفة مكتملة':room.visibility==='public'?'انضمام':'كود الدعوة مطلوب'} <DoorOpen size={16}/></button></article>)}</div>:<div className="studyRoomsEmpty"><Users size={32}/><b>مفيش غرف مفتوحة حاليًا</b><span>ابدأ بإنشاء أول غرفة مذاكرة وادعُ زملاءك.</span></div>}
  </>:<div className="studyRoomActive">
   <header className="studyRoomHeader"><div><span className="studyRoomsEyebrow">LIVE STUDY ROOM</span><h2>{activeRoom.title}</h2><p>{activeRoom.subject} · {members.length||activeRoom.memberCount}/5 أعضاء · <span className={'studyRoomConnection '+socketState}>{socketState==='connected'?'متصل':socketState==='connecting'?'جاري الاتصال':'إعادة الاتصال'}</span></p></div><div className="studyRoomHeaderActions">{activeRoom.ownerId===auth.id&&<button className="studyRoomClose" onClick={()=>void closeRoom()}>إنهاء الغرفة</button>}<button className="studyRoomLeave" onClick={()=>void leaveRoom()}><LogOut size={16}/> مغادرة</button></div></header>
   <div className="studyRoomLayout"><main className="studyRoomMain">
    <section className="studyRoomTimer"><div><span>المؤقت الجماعي</span><strong>{formatTime(remaining)}</strong><small>{timer.running?'الجلسة شغالة':'جاهزين نبدأ؟'}</small></div>{activeRoom.ownerId===auth.id?<div className="studyRoomTimerControls"><select value={duration} onChange={e=>setDuration(Number(e.target.value))}>{[25,50,60,90,120].map(x=><option value={x} key={x}>{x} دقيقة</option>)}</select>{timer.running?<button onClick={pauseTimer}><Pause size={15}/> إيقاف</button>:<button onClick={startTimer}><Play size={15}/> ابدأ</button>}</div>:<small>صاحب الغرفة يتحكم في المؤقت</small>}</section>
    <section className="studyRoomVoice"><div className="studyRoomVoiceIcon"><Volume2 size={19}/></div><div><b>الصوت المباشر</b><span>اتصال صوتي بين أعضاء الغرفة فقط — بدون كاميرا أو تسجيل.</span></div><button className={micOn?'micEnabled':'micDisabled'} onClick={()=>void toggleMic()} disabled={voiceBusy||socketState!=='connected'}>{micOn?<><MicOff size={17}/> إغلاق المايك</>:<><Mic size={17}/> فتح المايك</>}</button></section>
    <section className="studyRoomChat"><div className="studyRoomChatHead"><h3><MessageCircle size={18}/> دردشة الغرفة</h3><span>الرسائل النصية فقط تُستخدم كدليل عند الإبلاغ</span></div><div className="studyRoomMessages">{messages.length?messages.map(m=><div className={'studyRoomMessage '+(m.user_id===auth.id?'mine':'')} key={m.id}><b>{m.name}</b><p>{m.content}</p><small>{new Date(m.created_at).toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'})}</small></div>):<div className="studyRoomNoMessages">ابدأوا بتحية بعض أو اتفقوا على أول جلسة مذاكرة.</div>}</div><form className="studyRoomComposer" onSubmit={e=>{e.preventDefault();sendChat()}}><input value={draft} onChange={e=>setDraft(e.target.value.slice(0,500))} maxLength={500} placeholder="اكتب رسالة للغرفة..." disabled={socketState!=='connected'}/><button type="submit" disabled={!draft.trim()||socketState!=='connected'}><Send size={17}/> إرسال</button></form></section>
   </main><aside className="studyRoomSidebar"><section className="studyRoomMembers"><h3><Users size={17}/> أعضاء الغرفة <span>{members.length}/5</span></h3>{members.map(m=><div className="studyRoomMember" key={m.user_id}><div className="studyRoomAvatar">{(m.name||'ط').slice(0,1)}</div><div><b>{m.name}{m.user_id===activeRoom.ownerId&&<Crown size={13}/>}</b><small>{m.user_id===auth.id?'أنت':micMembers[m.user_id]?'المايك مفتوح':'موجود في الغرفة'}</small></div>{m.user_id!==auth.id&&<button title="إبلاغ عن العضو" onClick={()=>{setReportTarget(m);setReportReason(reasons[0]);setReportDetails('')}}><Flag size={15}/></button>}</div>)}</section><section className="studyRoomRules"><h4><ShieldCheck size={16}/> قواعد الغرفة</h4><p>احترم زملاءك، وخلي الكلام متعلق بالمذاكرة. تقدر تبلغ عن أي مخالفة، والإدارة هتراجع الدليل النصي.</p><small>لا يوجد تسجيل صوتي أو حفظ للمايك. الرسائل النصية مؤقتة (24 ساعة كحد أقصى).</small></section></aside></div>
  </div>}
  {showCreate&&<div className="studyRoomModalOverlay" onMouseDown={e=>{if(e.target===e.currentTarget)setShowCreate(false)}}><form className="studyRoomModal" onSubmit={e=>{e.preventDefault();void createRoom()}}><header><div><span className="studyRoomsEyebrow">NEW STUDY ROOM</span><h2>إنشاء غرفة مذاكرة</h2></div><button type="button" onClick={()=>setShowCreate(false)}><X size={18}/></button></header><label>اسم الغرفة<input value={title} onChange={e=>setTitle(e.target.value)} maxLength={60} required placeholder="مثال: مراجعة التفاضل"/></label><label>المادة<select value={subject} onChange={e=>setSubject(e.target.value)}>{['عام','اللغة العربية','اللغة الإنجليزية','الرياضيات','الفيزياء','الكيمياء'].map(x=><option key={x}>{x}</option>)}</select></label><label>وصف مختصر (اختياري)<textarea value={description} onChange={e=>setDescription(e.target.value)} maxLength={180} rows={2}/></label><label>نوع الغرفة<select value={visibility} onChange={e=>setVisibility(e.target.value as any)}><option value="public">عامة — تظهر في قائمة الغرف</option><option value="private">خاصة — تظهر لكن تحتاج كود دعوة</option><option value="hidden">مخفية — لا تظهر إلا للأعضاء</option></select></label>{visibility!=='public'&&<p className="studyRoomModalHint">هيتولد كود دعوة تلقائيًا بعد الإنشاء. شاركه مع زملائك فقط.</p>}<button className="studyRoomsCreate" type="submit"><Plus size={17}/> إنشاء الغرفة</button></form></div>}
  {joinTarget&&<div className="studyRoomModalOverlay" onMouseDown={e=>{if(e.target===e.currentTarget)setJoinTarget(null)}}><form className="studyRoomModal" onSubmit={e=>{e.preventDefault();void joinRoom(joinTarget,inviteCode)}}><header><div><span className="studyRoomsEyebrow">INVITE ONLY</span><h2>الانضمام إلى {joinTarget.title}</h2></div><button type="button" onClick={()=>setJoinTarget(null)}><X size={18}/></button></header><label>كود الدعوة<input value={inviteCode} onChange={e=>setInviteCode(e.target.value.toUpperCase().slice(0,16))} autoComplete="off" required placeholder="اكتب كود الدعوة"/></label><button className="studyRoomsCreate" type="submit">انضمام للغرفة</button></form></div>}
  {reportTarget&&<div className="studyRoomModalOverlay" onMouseDown={e=>{if(e.target===e.currentTarget)setReportTarget(null)}}><form className="studyRoomModal" onSubmit={e=>{e.preventDefault();void submitReport()}}><header><div><span className="studyRoomsEyebrow">SAFETY REPORT</span><h2>إبلاغ عن عضو</h2></div><button type="button" onClick={()=>setReportTarget(null)}><X size={18}/></button></header><p className="studyRoomModalHint">سيتم إرفاق آخر 40 رسالة نصية متاحة من الغرفة وقت البلاغ. لا يتم تسجيل الصوت أو إرفاقه.</p><label>العضو المُبلّغ عنه<input value={reportTarget.name} readOnly/></label><label>سبب البلاغ<select value={reportReason} onChange={e=>setReportReason(e.target.value)}>{reasons.map(x=><option key={x}>{x}</option>)}</select></label><label>تفاصيل إضافية<textarea value={reportDetails} onChange={e=>setReportDetails(e.target.value.slice(0,800))} maxLength={800} rows={3} placeholder="اشرح للإدارة ما حدث..."/></label><button className="studyRoomsCreate" type="submit"><Flag size={16}/> إرسال البلاغ بالدليل</button></form></div>}
  {roomCode&&<div className="studyRoomModalOverlay"><div className="studyRoomModal"><header><div><span className="studyRoomsEyebrow">INVITE CODE</span><h2>كود دعوة الغرفة</h2></div><button onClick={()=>setRoomCode('')}><X size={18}/></button></header><p className="studyRoomInviteCode">{roomCode}</p><p className="studyRoomModalHint">احتفظ بالكود وشاركه مع زملائك فقط. لن يظهر مرة أخرى بعد إغلاق النافذة.</p><button className="studyRoomsCreate" onClick={()=>{void navigator.clipboard?.writeText(roomCode);notify('تم نسخ كود الدعوة')}}>نسخ الكود</button><button className="studyRoomGhostButton" onClick={()=>setRoomCode('')}>إغلاق</button></div></div>}
 </section>;
}
