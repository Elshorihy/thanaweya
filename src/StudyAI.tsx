import React,{useEffect,useRef,useState} from 'react';
import * as webllm from '@mlc-ai/web-llm';

type AIProps={language:'ar'|'en';curriculum:string};
const MODEL='Qwen3-4B-q4f16_1-MLC';

export default function StudyAI({language,curriculum}:AIProps){
  const engineRef=useRef<any>(null);
  const [ready,setReady]=useState(false),[loading,setLoading]=useState(false),[progress,setProgress]=useState(0),[status,setStatus]=useState(''),[input,setInput]=useState(''),[messages,setMessages]=useState<Array<{role:'user'|'assistant';content:string}>>([]),[error,setError]=useState('');
  useEffect(()=>()=>{engineRef.current=null},[]);
  async function loadModel(){
    if(engineRef.current)return;
    if(!(navigator as any).gpu){setError(language==='ar'?'جهازك أو المتصفح لا يدعم WebGPU. جرّب Chrome/Edge حديث.':'WebGPU is not available. Try a recent Chrome or Edge browser.');return;}
    setLoading(true);setError('');
    try{
      const engine=await webllm.CreateMLCEngine(MODEL,{initProgressCallback:(p:any)=>{const v=typeof p?.progress==='number'?Math.max(0,Math.min(1,p.progress)):0;setProgress(v);setStatus(String(p?.text||''));}});
      engineRef.current=engine;setReady(true);setStatus(language==='ar'?'الذكاء الاصطناعي جاهز.':'AI is ready.');
    }catch(e){setError((e instanceof Error?e.message:String(e)).slice(0,500));}finally{setLoading(false);}
  }
  async function ask(){
    const q=input.trim();if(!q||loading)return;
    setInput('');setError('');
    const next=[...messages,{role:'user' as const,content:q}];setMessages(next);setLoading(true);
    try{
      if(!engineRef.current)await loadModel();
      const engine=engineRef.current;if(!engine)throw new Error(language==='ar'?'تعذر تشغيل الموديل على هذا الجهاز.':'The model could not run on this device.');
      const system=language==='ar'?'أنت مساعد دراسي داخل موقع ثانويه لطلاب الثانوية العامة في مصر. اشرح بالعربية الواضحة، وكن دقيقًا. في الرياضيات والعلوم اعرض خطوات الحل. إذا لم تكن متأكدًا قل ذلك ولا تخترع معلومات. لا تدّعِ أنك متصل بالإنترنت.':'You are a study assistant inside Thanaweya for Egyptian secondary-school students. Be accurate and clear. For math and science, show the steps. If unsure, say so instead of inventing facts. Do not claim internet access.';
      const curriculumContext=curriculum?'\nمنهج الطالب الموجود على جهازه:\n'+curriculum.slice(0,12000):'';
      const history=next.slice(-12).map(m=>({role:m.role,content:m.content}));
      const chunks=await engine.chat.completions.create({messages:[{role:'system',content:system+curriculumContext},...history],temperature:0.3,max_tokens:900,stream:true});
      let answer='';
      for await(const chunk of chunks){answer+=chunk.choices?.[0]?.delta?.content||'';setMessages([...next,{role:'assistant',content:answer}]);}
    }catch(e){setError((e instanceof Error?e.message:String(e)).slice(0,500));setMessages(next);}finally{setLoading(false);}
  }
  const ar=language==='ar';
  return <section className="aiPage" dir={ar?'rtl':'ltr'}>
    <div className="title"><div><div className="eyebrow">THANOWEYA AI</div><h1>{ar?'المساعد الذكي 🤖':'AI Study Assistant 🤖'}</h1><p>{ar?'مساعد مجاني يعمل على جهازك مباشرة — بدون اشتراك أو عدّاد رسائل.':'Free AI that runs directly on the student device — no subscription or message counter.'}</p></div>{!ready&&<button className="primary" onClick={loadModel} disabled={loading}>{loading?(ar?'جاري تجهيز الموديل…':'Loading model…'):(ar?'تشغيل الذكاء الاصطناعي':'Start AI')}</button>}</div>
    <div className="aiNotice"><strong>{ar?'مهم:':'Important:'}</strong> {ar?'أول تشغيل قد يحتاج تنزيل حوالي 3.4GB، وبعدها يُحفظ الموديل في متصفح الطالب ويعمل محليًا.':'The first run may download about 3.4GB. After that the model is cached in the browser and runs locally.'}</div>
    {loading&&<div className="aiProgress"><div><span>{status|| (ar?'جاري التحميل…':'Downloading…')}</span><b>{Math.round(progress*100)}%</b></div><div className="progress"><i style={{width:`${Math.max(2,progress*100)}%`}}/></div></div>}
    {error&&<div className="authError">⚠️ {error}</div>}
    <div className="aiChat"><div className="aiMessages">{!messages.length&&<div className="aiEmpty"><div className="aiIcon">🤖</div><h3>{ar?'اسأل أي سؤال دراسي':'Ask any study question'}</h3><p>{ar?'مثال: اشرح لي قانون نيوتن الثاني خطوة بخطوة.':'Example: Explain Newton’s second law step by step.'}</p></div>}{messages.map((m,i)=><div key={i} className={`aiBubble ${m.role}`}>{m.content}</div>)}</div><div className="aiComposer"><textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();ask()}}} placeholder={ar?'اكتب سؤالك هنا…':'Type your question…'} disabled={loading}/><button className="primary" onClick={ask} disabled={!input.trim()||loading}>{ar?'إرسال':'Send'}</button></div></div>
  </section>;
}
