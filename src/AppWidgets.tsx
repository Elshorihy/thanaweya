import React,{useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {Users,Home,BookOpen,CalendarDays,CheckSquare,Brain,Timer,BarChart3,Trophy,Bell,Settings,Plus,Search,Trash2,Play,Pause,RotateCcw,Download,Upload,Sun,Moon,Globe2,AlertCircle,X,Save,FileQuestion,NotebookPen,Calendar,AlertTriangle,Check,RefreshCw,ChevronLeft,ChevronRight,Smartphone,Clock,UserRound,Filter,Pencil,Zap,Gift,Palette,Sparkles,Lock,CheckCircle2,Gamepad2} from 'lucide-react';
import type {Store,SiteAnnouncement} from './main';

export function Title({title,sub,action}:{title:string;sub:string;action?:any}){return <div className="title"><div><h1>{title}</h1><p>{sub}</p></div>{action}</div>};export function VerifiedBadge(){return <span className="verifiedBadge" title="حساب موثق في ثانوية" aria-label="حساب موثق في ثانوية"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 7.5 12 3.5l8.5 4L12 11.7 3.5 7.5Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="M6.5 9.2v4.1c3.3 2.6 7.7 2.6 11 0V9.2M20.5 13v4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/><path d="m15.7 18 1.7 1.7 3.1-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></span>}
export function AIGate({auth,go}:{auth:import('./auth').AuthUser;go:(p:string)=>void}){return <section className="aiPage"><Title title="🤖 ثانوية AI" sub="المساعد الشخصي متاح للحسابات ذات الاشتراك المفعّل."/><Card title="🔐 ثانوية AI متاحة بالتوثيق"><div className="verificationBenefits"><b>✨ هتستفيد بإيه؟</b><div>🤖 شات نصي فعلي مع ثانوية AI</div><div>📅 إنشاء وتنظيم جدول مذاكرتك داخل الموقع</div><div>📝 تنظيم المهام والخطط والتقدم</div><div>⚡ تنفيذ الإجراءات المسموح بها داخل حسابك</div></div><p className="muted">فعّل اشتراك التوثيق بـ30 جنيه شهريًا، وبعد موافقة الإدارة هتفتح لك ثانوية AI تلقائيًا.</p><button className="primary wide" onClick={()=>go('settings')}>🔐 توثيق الحساب — 30 جنيه / شهر</button></Card></section>}
export function AIPage({auth,s,go,notify}:{auth:import('./auth').AuthUser;s:Store;go:(p:string)=>void;notify:(m:string)=>void}){
  type Chat={id:string;title:string;created_at:number;updated_at:number};type Msg={role:'user'|'assistant';text:string;created_at?:number};
  const [busy,setBusy]=useState(false),[input,setInput]=useState(''),[messages,setMessages]=useState<Msg[]>([]),[chats,setChats]=useState<Chat[]>([]),[chatId,setChatId]=useState(''),[loadingChats,setLoadingChats]=useState(true),[loadingMessages,setLoadingMessages]=useState(false),[historyError,setHistoryError]=useState(''),[used,setUsed]=useState(0),[limit,setLimit]=useState(40);
  const listRef=useRef<HTMLDivElement|null>(null);
  const loadMessages=async(id:string)=>{if(!id){setMessages([]);return}setLoadingMessages(true);setHistoryError('');const controller=new AbortController();const timer=window.setTimeout(()=>controller.abort(),12000);try{const r=await fetch('/api/ai/chats/'+encodeURIComponent(id),{credentials:'include',cache:'no-store',signal:controller.signal});const d=await r.json().catch(()=>({}));if(!r.ok){setMessages([]);setHistoryError(String(d?.error||`تعذر تحميل رسائل المحادثة (HTTP ${r.status}).`));return}if(!Array.isArray(d?.messages)){setMessages([]);setHistoryError('استجابة الخادم لتحميل الرسائل غير صحيحة.');return}setMessages(d.messages.map((x:any)=>({role:x.role==='assistant'?'assistant':'user',text:String(x.text||''),created_at:Number(x.created_at||0)})))}catch(e){setMessages([]);setHistoryError(e instanceof DOMException&&e.name==='AbortError'?'تحميل رسائل المحادثة استغرق أكثر من 12 ثانية. اضغط إعادة المحاولة.':'تعذر الاتصال بالخادم أثناء تحميل رسائل المحادثة.')}finally{window.clearTimeout(timer);setLoadingMessages(false)}};
  const loadChats=async(selectId?:string)=>{setLoadingChats(true);setHistoryError('');const controller=new AbortController();const timer=window.setTimeout(()=>controller.abort(),12000);try{const r=await fetch('/api/ai/chats',{credentials:'include',cache:'no-store',signal:controller.signal});const d=await r.json().catch(()=>({}));if(!r.ok||!Array.isArray(d?.chats)){setHistoryError(String(d?.error||`تعذر تحميل المحادثات (HTTP ${r.status}).`));return}const next=d.chats as Chat[];setChats(next);const target=selectId||chatId||next[0]?.id||'';if(target){setChatId(target);await loadMessages(target)}else{setChatId('');setMessages([])}}catch(e){setHistoryError(e instanceof DOMException&&e.name==='AbortError'?'تحميل المحادثات استغرق أكثر من 12 ثانية. اضغط إعادة المحاولة.':'تعذر الاتصال بالخادم أثناء تحميل المحادثات.')}finally{window.clearTimeout(timer);setLoadingChats(false)}};
  const loadUsage=async()=>{try{const r=await fetch('/api/ai/usage',{credentials:'include',cache:'no-store'});const d=await r.json().catch(()=>({}));if(r.ok){setUsed(Number(d?.used||0));setLimit(Number(d?.limit||40))}}catch{}}; useEffect(()=>{loadChats();loadUsage()},[auth.id]);useEffect(()=>{listRef.current?.scrollTo({top:listRef.current.scrollHeight,behavior:'smooth'})},[messages,busy,loadingMessages]);
  const newChat=()=>{setChatId('');setMessages([]);setInput('')};
  const deleteChat=async(id:string)=>{if(!id||busy)return;try{const r=await fetch('/api/ai/chats/'+encodeURIComponent(id),{method:'DELETE',credentials:'include'});if(!r.ok)return;const remaining=chats.filter(x=>x.id!==id);setChats(remaining);if(chatId===id){const next=remaining[0]?.id||'';setChatId(next);if(next)await loadMessages(next);else setMessages([])}}catch{}};
  const ask=async()=>{
    const question=input.trim();
    if(!question||busy||used>=limit)return;
    setMessages(v=>[...v,{role:'user',text:question}]);
    setInput('');
    setBusy(true);
    try{
      let answer='',rd:any=null,failureMessage='تعذر الاتصال بخدمة الذكاء الاصطناعي. تحقق من اتصالك وحاول مرة أخرى.';
      try{
        const r=await fetch('/api/ai/advice',{
          method:'POST',
          credentials:'include',
          headers:{'content-type':'application/json'},
          body:JSON.stringify({question,conversationId:chatId||undefined})
        });
        const d=await r.json().catch(()=>({}));
        if(r.ok&&String(d?.answer||'').trim()){answer=String(d.answer).trim();rd=d}
        else{failureMessage=String(d?.error||`فشل الطلب إلى الخادم (HTTP ${r.status}).`);if(r.status===429){setUsed(Number(d?.used||limit));setLimit(Number(d?.limit||limit))}notify(failureMessage)}
      }catch(e){failureMessage=e instanceof Error?e.message:failureMessage;notify(failureMessage)}
      if(answer){
        setUsed(Number(rd?.used||used+1));
        setLimit(Number(rd?.limit||limit));
        const rid=String(rd?.conversationId||chatId||'');
        setChatId(rid);
        setChats(prev=>{
          const now=Date.now(),old=prev.find(x=>x.id===rid);
          if(old)return prev.map(x=>x.id===rid?{...x,updated_at:now}:x).sort((a,b)=>b.updated_at-a.updated_at);
          return[{id:rid,title:question.slice(0,70),created_at:now,updated_at:now},...prev]
        });
        setMessages(v=>[...v,{role:'assistant',text:answer}]);
        // Reload the conversation and messages from D1 after every successful reply.
        // This makes history reflect the persisted server record, not only local React state.
        await loadChats(rid);
        if(rd?.action?.executed){
          notify('✅ تم تنفيذ طلبك داخل الموقع.');
          window.dispatchEvent(new CustomEvent('thanaweya-ai-data-updated'));
        }
      }else{
        setMessages(v=>[...v,{role:'assistant',text:failureMessage}]);
      }
    }finally{setBusy(false)}
  };
  const pending=s.tasks.filter(x=>x.status!=='completed').length,done=s.lessons.filter(x=>x.status==='completed').length;const quick=(q:string)=>setInput(q);
  return <section className="aiPage">
   <div className="title"><div><h1>🤖 ثانوية AI</h1><p>مساعد مذاكرة شخصي يفهم بيانات حسابك ويتكلم معاك في شات حقيقي.</p></div><button className="primary" onClick={newChat}>＋ محادثة جديدة</button></div>
   <div className="aiHero card"><div><span className="eyebrow">GEMINI POWERED</span><h2>أهلاً {s.profile.name||auth.name} <VerifiedBadge/></h2><p className="muted">المساعد يقدر يشوف بيانات مذاكرتك المحفوظة في حسابك، وكمان ينفذ الإجراءات المسموح بها داخل حسابك.</p></div><div className="aiStats"><b>{s.subjects.length}<small>مواد</small></b><b>{done}<small>دروس مكتملة</small></b><b>{pending}<small>مهام متبقية</small></b></div></div>
   <div className="aiWorkspace"><aside className="aiHistory card"><div className="cardhead"><h2>💬 محادثاتي</h2><button className="ghost" onClick={newChat}>＋ جديدة</button></div><div className="aiHistoryList">{historyError&&<p className="fieldError" role="alert">{historyError} <button className="ghost" onClick={()=>loadChats(chatId||undefined)}>إعادة المحاولة</button></p>}{loadingChats&&<p className="muted">جاري تحميل المحادثات...</p>}{!loadingChats&&!chats.length&&<p className="muted">لسه مفيش محادثات محفوظة.</p>}{chats.map(c=><div className={'aiHistoryItem '+(chatId===c.id?'active':'')} key={c.id} onClick={()=>{setChatId(c.id);loadMessages(c.id)}}><button className="aiHistoryDelete" aria-label="حذف المحادثة" title="حذف المحادثة" onClick={e=>{e.stopPropagation();deleteChat(c.id)}}><Trash2 size={15}/></button><b>{c.title||'محادثة جديدة'}</b><small>{new Date(c.updated_at).toLocaleDateString('ar-EG')}</small></div>)}</div></aside>
    <div className="aiChatCard card"><div className="aiChatHeader"><div><b>{chats.find(x=>x.id===chatId)?.title||'محادثة جديدة'}</b><small>{chatId?'المحادثة محفوظة في حسابك':'هتتحفظ تلقائيًا عند أول رسالة'}</small></div>{chatId&&<button className="ghost" disabled={busy} onClick={()=>deleteChat(chatId)}>🗑️ حذف المحادثة</button>}</div>
      <div className="aiQuick"><div className="choices"><button onClick={()=>quick('إيه أهم حاجة أذاكرها دلوقتي؟')}>🎯 أذاكر إيه دلوقتي؟</button><button onClick={()=>quick('حلل تقدمي وقولي أنا متأخر فين.')}>📊 حلل تقدمي</button><button onClick={()=>quick('رتبلي أولويات مذاكرتي النهارده.')}>📅 رتب أولوياتي</button><button onClick={()=>quick('اعمل لي جدول مذاكرة مناسب لبياناتي، وبعدها نظمه في قسم جدولي.')}>🗓️ نظّملي جدولي</button></div></div>
      <div className="aiChat" ref={listRef}>{!messages.length&&!loadingMessages&&<div className="aiEmpty"><span>🧠</span><strong>ابدأ الكلام</strong><p>اسألني عن المذاكرة، المواد، جدولك، أو اطلب مني أنظم جدولك داخل «جدولي».</p></div>}{loadingMessages&&<div className="aiEmpty"><span>⏳</span><strong>جاري فتح المحادثة...</strong></div>}{messages.map((msg,i)=><div className={'aiBubble '+msg.role} key={i}><span className="aiBubbleRole">{msg.role==='user'?'أنت':'ثانوية AI'}</span><div>{msg.text.split('\n').map((x,j)=><p key={j}>{x||' '}</p>)}</div></div>)}{busy&&<div className="aiBubble assistant"><span className="aiBubbleRole">ثانوية AI</span><div><p>🧠 بفكر في الرد...</p></div></div>}</div>
      <label>اتكلم مع ثانوية AI<textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();ask()}}} placeholder="اكتب رسالتك هنا..."/></label><button className="primary wide" disabled={busy||!input.trim()} onClick={ask}>{busy?'🧠 جاري الرد...':'🤖 إرسال الرسالة'}</button><div className="aiUsage"><div><b>📊 استخدامك اليومي</b><span>متبقي <strong>{Math.max(0,limit-used)}</strong> من {limit} رسالة</span></div><div className="aiUsageBar"><i style={{width:`${Math.min(100,(used/Math.max(1,limit))*100)}%`}}/></div></div><p className="muted aiPrivacy">🔒 المحادثات محفوظة في حسابك. حذف المحادثة يحذف رسائلها من قاعدة بيانات الموقع. الموقع لا يضع مفتاح Gemini في الواجهة.</p>
    </div></div>
  </section>
}
export function Card({title,children,action}:{title:string;children:any;action?:any}){return <div className="card"><div className="cardhead"><h2>{title}</h2>{action}</div>{children}</div>}
export function Modal({title,children,onClose}:{title:string;children:any;onClose:()=>void}){return <div className="overlay" onClick={onClose}><div className="modal" onClick={e=>e.stopPropagation()}><div className="cardhead"><h2>{title}</h2><button aria-label="إغلاق" onClick={onClose}><X/></button></div>{children}</div></div>}
export function pushBase64ToBytes(value:string){
 const pad="=".repeat((4-value.length%4)%4);
 const raw=atob((value+pad).replace(/-/g,"+").replace(/_/g,"/"));
 const out=new Uint8Array(raw.length);
 for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);
 return out;
}
export function StudentBridge({auth,notify,onRequireAuth}:{auth:import('./auth').AuthUser|null,notify:(message:string)=>void,onRequireAuth:()=>void}){
 const [open,setOpen]=useState(false),[tab,setTab]=useState<'report'|'messages'|'polls'>('report'),[unread,setUnread]=useState(0);
 const [category,setCategory]=useState('مشكلة تقنية'),[reportText,setReportText]=useState(''),[messageText,setMessageText]=useState('');
 const [reports,setReports]=useState<any[]>([]),[messages,setMessages]=useState<any[]>([]),[polls,setPolls]=useState<any[]>([]),[busy,setBusy]=useState(false),[bridgeError,setBridgeError]=useState(''),[bridgeLoading,setBridgeLoading]=useState(false);
 const refreshUnread=async()=>{
  if(!auth){setUnread(0);return}
  try{const r=await fetch('/api/bridge/notifications',{credentials:'include',cache:'no-store'});if(!r.ok)return;const d=await r.json();setUnread(Math.max(0,Number(d.unread)||0));}catch{}
 };
 const markNotificationsRead=async()=>{
  try{const r=await fetch('/api/bridge/notifications/read',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:'{}'});if(r.ok)setUnread(0);}catch{}
 };
 const load=async()=>{
  if(!auth)return;
  setBridgeLoading(true);setBridgeError('');
  try{
   const results=await Promise.all([
    (async()=>{try{const r=await fetch('/api/bridge/reports',{credentials:'include',cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(String(d?.error||'HTTP '+r.status));return {key:'البلاغات',data:d};}catch(e){return {key:'البلاغات',error:e instanceof Error?e.message:'تعذر تحميل البلاغات'};}})(),
    (async()=>{try{const r=await fetch('/api/bridge/messages',{credentials:'include',cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(String(d?.error||'HTTP '+r.status));return {key:'الرسائل',data:d};}catch(e){return {key:'الرسائل',error:e instanceof Error?e.message:'تعذر تحميل الرسائل'};}})(),
    (async()=>{try{const r=await fetch('/api/bridge/polls',{credentials:'include',cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(String(d?.error||'HTTP '+r.status));return {key:'الاستطلاعات',data:d};}catch(e){return {key:'الاستطلاعات',error:e instanceof Error?e.message:'تعذر تحميل الاستطلاعات'};}})()
   ]);
   const reportsResult=results[0],messagesResult=results[1],pollsResult=results[2];
   if('data' in reportsResult)setReports(Array.isArray(reportsResult.data.reports)?reportsResult.data.reports:[]);
   if('data' in messagesResult)setMessages(Array.isArray(messagesResult.data.messages)?messagesResult.data.messages:[]);
   if('data' in pollsResult)setPolls(Array.isArray(pollsResult.data.polls)?pollsResult.data.polls:[]);
   const errors=results.filter((x:any)=>'error' in x).map((x:any)=>x.key+': '+x.error);
   setBridgeError(errors.join(' — '));
  }catch(e){setBridgeError(e instanceof Error?e.message:'تعذر الاتصال بمركز التواصل. جرّب التحديث.');}
  finally{setBridgeLoading(false);}
 };
 useEffect(()=>{if(!auth){setUnread(0);return}refreshUnread();const timer=window.setInterval(refreshUnread,15000);return()=>window.clearInterval(timer);},[auth?.id]);
 useEffect(()=>{if(auth)load();},[auth?.id,open,tab]);
 useEffect(()=>{if(open&&auth){markNotificationsRead();}},[open,auth?.id]);
 if(!auth)return <button className="supportLauncher" type="button" onClick={onRequireAuth} aria-label="الدعم والتواصل - سجّل الدخول" style={{position:'fixed',zIndex:1001,bottom:18,left:14,border:0,borderRadius:999,padding:'12px 16px',background:'linear-gradient(135deg,#7c3aed,#2563eb)',color:'#fff',fontWeight:800,boxShadow:'0 8px 30px #0006',cursor:'pointer',display:'inline-flex',alignItems:'center',gap:8}}>💬 الدعم والتواصل</button>;
 const sendReport=async(e:React.FormEvent)=>{
  e.preventDefault();if(reportText.trim().length<8){notify('اكتب تفاصيل أوضح للمشكلة.');return}
  setBusy(true);try{const r=await fetch('/api/bridge/reports',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({category,message:reportText})});const d=await r.json();if(!r.ok)throw new Error(d.error||'تعذر إرسال البلاغ');setReportText('');await load();notify('وصل بلاغك للإدارة، هتقدر تتابع حالته هنا.');setTab('report')}catch(e){notify(e instanceof Error?e.message:'تعذر إرسال البلاغ')}finally{setBusy(false)}
 };
 const sendMessage=async(e:React.FormEvent)=>{
  e.preventDefault();if(!messageText.trim())return;setBusy(true);try{const r=await fetch('/api/bridge/messages',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({message:messageText})});const d=await r.json().catch(()=>({}));if(d.saved){setMessageText('');await load();notify(d.error||'تم حفظ رسالتك، لكن تعذر تنبيه الإدارة عبر تيليجرام.')}else if(!r.ok)throw new Error(d.error||'تعذر إرسال الرسالة');else{setMessageText('');await load();notify('رسالتك وصلت للإدارة.')}}catch(e){notify(e instanceof Error?e.message:'تعذر إرسال الرسالة')}finally{setBusy(false)}
 };
 const vote=async(pollId:string,optionIndex:number)=>{setBusy(true);try{const r=await fetch('/api/bridge/polls/vote',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({pollId,optionIndex})});const d=await r.json();if(!r.ok)throw new Error(d.error||'تعذر تسجيل التصويت');await load();notify('تم تسجيل صوتك.')}catch(e){notify(e instanceof Error?e.message:'تعذر التصويت')}finally{setBusy(false)}};
 const panelStyle:React.CSSProperties={position:'fixed',zIndex:1000,bottom:76,left:14,width:'min(370px,calc(100vw - 28px))',maxHeight:'72vh',overflow:'auto',background:'var(--card, #151922)',color:'var(--text, #f5f5f5)',border:'1px solid var(--border, #333)',borderRadius:18,padding:14,boxShadow:'0 18px 60px #0008'};
 const fieldStyle:React.CSSProperties={width:'100%',boxSizing:'border-box',padding:10,borderRadius:10,border:'1px solid var(--border, #444)',background:'var(--input, #0d1117)',color:'inherit',marginTop:6};
 return <><button className="supportLauncher" onClick={()=>setOpen(v=>!v)} aria-label={unread>0?'الدعم والتواصل، لديك '+unread+' إشعارات جديدة':'الدعم والتواصل'} style={{position:'fixed',zIndex:1001,bottom:18,left:14,border:0,borderRadius:999,padding:'12px 16px',background:'linear-gradient(135deg,#7c3aed,#2563eb)',color:'#fff',fontWeight:800,boxShadow:'0 8px 30px #0006',cursor:'pointer',display:'inline-flex',alignItems:'center',gap:8}}>{open?'✕ إغلاق':'💬 الدعم والتواصل'}{!open&&unread>0&&<span aria-label="إشعار جديد" title="لديك رد جديد" style={{position:'absolute',top:-4,right:-3,width:13,height:13,borderRadius:'50%',background:'#ef4444',border:'2px solid #fff',boxShadow:'0 0 0 2px #ef444455'}}/>}</button>{open&&<section className="supportPanel" style={panelStyle} dir="rtl"><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}><strong style={{fontSize:16}}>مركز التواصل مع الإدارة</strong><button onClick={()=>load()} style={{border:0,background:'transparent',color:'inherit',cursor:'pointer'}}>🔄</button></div><p style={{opacity:.75,fontSize:12,margin:'6px 0 12px'}}>بلاغاتك ورسائلك وردود الإدارة محفوظة في حسابك.</p>{bridgeLoading&&<p role="status" style={{fontSize:12,opacity:.8}}>⏳ جاري تحميل بيانات الدعم والاستطلاعات…</p>}{bridgeError&&<div role="alert" style={{padding:10,borderRadius:10,background:'#7f1d1d33',fontSize:12,marginBottom:10}}>{bridgeError}<button onClick={()=>load()} style={{display:'block',marginTop:8,padding:'6px 10px',borderRadius:8,border:'1px solid var(--border, #444)',background:'transparent',color:'inherit',cursor:'pointer'}}>🔄 إعادة المحاولة</button></div>}<div style={{display:'flex',gap:6,marginBottom:12}}>{([['report','🎫 بلاغ'],['messages','💬 رسائل'],['polls','📊 استطلاعات']] as const).map(([k,label])=><button key={k} onClick={()=>setTab(k)} style={{flex:1,padding:'8px 4px',borderRadius:9,border:'1px solid var(--border, #444)',background:tab===k?'#3730a3':'transparent',color:'inherit',fontSize:12,cursor:'pointer'}}>{label}</button>)}</div>
 {tab==='report'&&<><form onSubmit={sendReport}><label style={{display:'block',fontSize:13}}>نوع المشكلة<select value={category} onChange={e=>setCategory(e.target.value)} style={fieldStyle}><option>مشكلة تقنية</option><option>مشكلة في الحساب</option><option>مشكلة في ثانوية AI</option><option>اقتراح ميزة</option><option>أخرى</option></select></label><label style={{display:'block',fontSize:13,marginTop:10}}>اشرح اللي حصل<textarea value={reportText} onChange={e=>setReportText(e.target.value)} required minLength={8} maxLength={2000} rows={3} placeholder="اكتب المشكلة والخطوات اللي عملتها..." style={{...fieldStyle,resize:'vertical'}}/></label><button disabled={busy} style={{...fieldStyle,background:'#4f46e5',border:0,fontWeight:800,cursor:'pointer'}}>📨 إرسال للإدارة</button></form><div style={{marginTop:14}}><strong style={{fontSize:13}}>بلاغاتي السابقة</strong>{reports.length===0?<p style={{opacity:.65,fontSize:12}}>لسه مفيش بلاغات.</p>:reports.map(r=><article key={r.id} style={{padding:'9px 0',borderBottom:'1px solid var(--border, #333)',fontSize:12}}><b>{r.category}</b><span style={{float:'left'}}>{r.status==='resolved'?'✅ تم الحل':r.status==='in_progress'?'🛠️ قيد الحل':'🆕 جديد'}</span><p style={{margin:'6px 0',opacity:.85}}>{r.message}</p>{r.admin_reply&&<p style={{margin:'6px 0',padding:8,borderRadius:8,background:'#14532d33'}}>رد الإدارة: {r.admin_reply}</p>}</article>)}</div></>}
 {tab==='messages'&&<><div style={{maxHeight:230,overflow:'auto'}}>{messages.length===0?<p style={{opacity:.65,fontSize:12}}>مفيش رسائل لسه. ابعت رسالة للإدارة من تحت.</p>:messages.map(x=><div key={x.id} style={{margin:'8px 0',padding:9,borderRadius:10,background:x.sender==='admin'?'#14532d33':'#3730a133'}}><small style={{opacity:.65}}>{x.sender==='admin'?'الإدارة':'أنت'} · {new Date(Number(x.created_at||Date.now())).toLocaleString('ar-EG')}</small><div translate="no" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',marginTop:4}}>{x.message}</div></div>)}</div><form onSubmit={sendMessage}><textarea value={messageText} onChange={e=>setMessageText(e.target.value)} rows={2} maxLength={2000} placeholder="اكتب رسالتك..." style={{...fieldStyle,resize:'vertical'}}/><button disabled={busy||!messageText.trim()} style={{...fieldStyle,background:'#4f46e5',border:0,fontWeight:800,cursor:'pointer'}}>📨 إرسال الرسالة</button></form></>}
 {tab==='polls'&&<div>{polls.length===0?<p style={{opacity:.65,fontSize:12}}>مفيش استطلاعات نشطة حاليًا.</p>:polls.map((poll:any)=><div key={poll.id} style={{padding:'10px 0',borderBottom:'1px solid #333'}}><strong>{poll.question}</strong>{poll.options.map((option:string,index:number)=><button key={index} disabled={poll.voted!==null||busy} onClick={()=>vote(poll.id,index)} style={{...fieldStyle,display:'block',textAlign:'right',background:poll.voted===index?'#14532d55':'#0d1117'}}>{poll.voted===index?'✅ ':''}{option}{poll.voted!==null?' — '+Number(poll.counts?.[String(index)]||0)+' صوت':''}</button>)}{poll.voted!==null&&<small style={{opacity:.65}}>تم تسجيل تصويتك.</small>}</div>)}</div>}
 </section>}</>;
}
export function SiteAnnouncementBanner({userId}:{userId?:string}){
 const [a,setA]=useState<SiteAnnouncement|null>(null);
 const [closed,setClosed]=useState(false);
 useEffect(()=>{
  let cancelled=false;
  let timer:number|undefined;
  fetch('/api/announcement',{credentials:'include'}).then(r=>r.ok?r.json():null).then(x=>{
   if(cancelled||!x?.announcement)return;
   const next=x.announcement as SiteAnnouncement;
   if(next.type==='first'){
    try{if(localStorage.getItem('thanaweya_announcement_seen_'+(userId||'guest')+'_'+next.id)==='1'){setClosed(true);return}}catch{}
   }
   setA(next);
   if(next.placement==='modal'&&next.durationSec>0){
    timer=window.setTimeout(()=>{
      if(next.type==='first'){
       try{localStorage.setItem('thanaweya_announcement_seen_'+(userId||'guest')+'_'+next.id,'1')}catch{}
      }
      setClosed(true);
    },next.durationSec*1000);
   }
  }).catch(()=>{});
  return()=>{cancelled=true;if(timer!==undefined)window.clearTimeout(timer)};
 },[userId]);
 if(!a||closed)return null;
 const close=()=>{
  if(a.type==='first'){
   try{localStorage.setItem('thanaweya_announcement_seen_'+(userId||'guest')+'_'+a.id,'1')}catch{}
  }
  setClosed(true);
 };
 const button=a.buttonText&&a.buttonUrl?<a className="siteAnnouncementButton" href={a.buttonUrl} target="_blank" rel="noreferrer">{a.buttonText}</a>:null;
 if(a.placement==='modal')return <div className="siteAnnouncementOverlay" role="dialog" aria-modal="true"><div className="siteAnnouncementModal"><div className="siteAnnouncementIcon">📢</div><div className="siteAnnouncementBody"><strong>{a.title}</strong><p>{a.message}</p>{button}</div><button onClick={close} aria-label="إغلاق"><X size={20}/></button><span className="siteAnnouncementTimer">{a.durationSec}ث</span></div></div>;
 return <div className={'siteAnnouncement siteAnnouncement-'+a.placement} role="alert"><div className="siteAnnouncementIcon">📢</div><div className="siteAnnouncementBody"><strong>{a.title}</strong><p>{a.message}</p>{button}{a.type==='temporary'&&a.expiresAt&&<small>إعلان مؤقت</small>}</div><button onClick={close} aria-label="إغلاق"><X size={18}/></button></div>;
   }
