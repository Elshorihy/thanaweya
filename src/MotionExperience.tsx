import React,{useEffect,useRef,useState} from 'react';
import {X,GraduationCap} from 'lucide-react';

const SESSION_KEY='thanaweya-motion-intro-session-v1';

function shouldShowIntro(){
  try{
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return false;
    if(sessionStorage.getItem(SESSION_KEY)==='seen')return false;
    sessionStorage.setItem(SESSION_KEY,'seen');
    return true;
  }catch{return false}
}

export default function MotionExperience(){
  const canvasRef=useRef<HTMLCanvasElement|null>(null);
  const [intro,setIntro]=useState(false);
  const [celebration,setCelebration]=useState(false);

  useEffect(()=>{setIntro(shouldShowIntro())},[]);

  useEffect(()=>{
    const canvas=canvasRef.current;
    const ctx=canvas?.getContext('2d',{alpha:true});
    if(!canvas||!ctx)return;
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
    if(reduced.matches)return;
    let frame=0,raf=0,width=0,height=0,dpr=1,visible=!document.hidden;
    type Particle={x:number;y:number;r:number;vx:number;vy:number;a:number};
    let particles:Particle[]=[];
    let sceneOpacity=1;
    const getScene=()=>{
      if(document.querySelector('.focusLab,.focuspage'))return {density:.35,opacity:.28,links:false};
      if(document.querySelector('.authGate'))return {density:.8,opacity:.75,links:true};
      if(document.querySelector('.newLanding'))return {density:1,opacity:1,links:true};
      if(document.querySelector('.appMain'))return {density:.62,opacity:.62,links:true};
      return {density:.55,opacity:.5,links:false};
    };
    const resize=()=>{
      dpr=Math.min(window.devicePixelRatio||1,1.5);
      width=window.innerWidth;height=window.innerHeight;
      canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
      canvas.style.width=width+'px';canvas.style.height=height+'px';
      ctx.setTransform(dpr,0,0,dpr,0,0);
      const scene=getScene();
      sceneOpacity=scene.opacity;
      const base=width<600?18:width<1000?30:46;
      const count=Math.max(8,Math.round(base*scene.density));
      particles=Array.from({length:count},()=>({x:Math.random()*width,y:Math.random()*height,r:.6+Math.random()*1.5,vx:(Math.random()-.5)*.22,vy:-.08-Math.random()*.2,a:.12+Math.random()*.38}));
      canvas.style.opacity=String(sceneOpacity);
    };
    const draw=()=>{
      if(!visible){raf=0;return}
      frame++;
      ctx.clearRect(0,0,width,height);
      const scene=getScene();
      for(const p of particles){
        p.x+=p.vx;p.y+=p.vy;
        if(p.y<-4){p.y=height+4;p.x=Math.random()*width}
        if(p.x<-4)p.x=width+4;if(p.x>width+4)p.x=-4;
        ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
        ctx.fillStyle='rgba(82,220,232,'+(p.a*sceneOpacity)+')';ctx.fill();
      }
      if(scene.links&&frame%4===0){
        for(let i=0;i<particles.length;i++){
          const a=particles[i];
          for(let j=i+1;j<particles.length;j++){
            const b=particles[j],dx=a.x-b.x,dy=a.y-b.y,d=dx*dx+dy*dy;
            if(d<76*76){ctx.strokeStyle='rgba(54,183,210,'+(Math.max(0,1-Math.sqrt(d)/76)*.055*sceneOpacity)+')';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke()}
          }
        }
      }
      raf=requestAnimationFrame(draw);
    };
    const onVisibility=()=>{visible=!document.hidden;if(visible&&!raf)raf=requestAnimationFrame(draw);if(!visible&&raf){cancelAnimationFrame(raf);raf=0}};
    const onMotion=(e:MediaQueryListEvent)=>{if(e.matches){cancelAnimationFrame(raf);raf=0;ctx.clearRect(0,0,width,height)}else if(visible&&!raf){resize();raf=requestAnimationFrame(draw)}};
    let resizeTimer=0;
    const onResize=()=>{window.clearTimeout(resizeTimer);resizeTimer=window.setTimeout(resize,100)};
    const observer=new MutationObserver(()=>{resize()});
    observer.observe(document.getElementById('root')||document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
    resize();raf=requestAnimationFrame(draw);
    window.addEventListener('resize',onResize,{passive:true});
    document.addEventListener('visibilitychange',onVisibility);
    reduced.addEventListener?.('change',onMotion);
    return()=>{cancelAnimationFrame(raf);window.clearTimeout(resizeTimer);observer.disconnect();window.removeEventListener('resize',onResize);document.removeEventListener('visibilitychange',onVisibility);reduced.removeEventListener?.('change',onMotion)};
  },[]);

  useEffect(()=>{
    let timer=0;
    const celebrate=()=>{setCelebration(true);window.clearTimeout(timer);timer=window.setTimeout(()=>setCelebration(false),1450)};
    window.addEventListener('thanaweya:achievement',celebrate);
    return()=>{window.clearTimeout(timer);window.removeEventListener('thanaweya:achievement',celebrate)};
  },[]);

  useEffect(()=>{
    if(!intro)return;
    const timer=window.setTimeout(()=>setIntro(false),2300);
    const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')setIntro(false)};
    window.addEventListener('keydown',onKey);
    return()=>{window.clearTimeout(timer);window.removeEventListener('keydown',onKey)};
  },[intro]);

  return <>
    <canvas id="thanaweya-particles" ref={canvasRef} aria-hidden="true"/>
    {celebration&&<div className="motionCelebration" aria-live="polite"><div className="motionCelebrationBurst"/><strong>عاش! مهمة اتنجزت</strong><span>خطوة كمان ناحية هدفك</span></div>}
    {intro&&<div className="motionIntro" role="dialog" aria-label="مقدمة ثانوية" aria-modal="true">
      <div className="motionIntroGlow"/>
      <div className="motionIntroContent"><div className="motionIntroLogo"><GraduationCap size={43}/></div><span className="motionIntroEyebrow">YOUR NEXT CHAPTER</span><h1>ثانوية</h1><p>خطوة بخطوة، توصل</p><div className="motionIntroLine"><i/></div></div>
      <button className="motionIntroSkip" type="button" onClick={()=>setIntro(false)}><X size={15}/> تخطي المقدمة</button>
    </div>}
  </>;
}
