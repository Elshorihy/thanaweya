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
    const resize=()=>{
      dpr=Math.min(window.devicePixelRatio||1,1.5);
      width=window.innerWidth;height=window.innerHeight;
      canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
      canvas.style.width=width+'px';canvas.style.height=height+'px';
      ctx.setTransform(dpr,0,0,dpr,0,0);
      const count=width<600?18:width<1000?30:46;
      particles=Array.from({length:count},()=>({x:Math.random()*width,y:Math.random()*height,r:.6+Math.random()*1.5,vx:(Math.random()-.5)*.22,vy:-.08-Math.random()*.2,a:.12+Math.random()*.38}));
    };
    const draw=()=>{
      if(!visible){raf=0;return}
      frame++;
      ctx.clearRect(0,0,width,height);
      const focus=!!document.querySelector('.focusLab,.focuspage');
      const opacity=focus ? .55 : 1;
      for(const p of particles){
        p.x+=p.vx;p.y+=p.vy;
        if(p.y<-4){p.y=height+4;p.x=Math.random()*width}
        if(p.x<-4)p.x=width+4;if(p.x>width+4)p.x=-4;
        ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
        ctx.fillStyle='rgba(82,220,232,'+(p.a*opacity)+')';ctx.fill();
      }
      if(frame%3===0){
        for(let i=0;i<particles.length;i++){
          const a=particles[i];
          for(let j=i+1;j<particles.length;j++){
            const b=particles[j],dx=a.x-b.x,dy=a.y-b.y,d=dx*dx+dy*dy;
            if(d<76*76){ctx.strokeStyle='rgba(54,183,210,'+(Math.max(0,1-Math.sqrt(d)/76)*.055*opacity)+')';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke()}
          }
        }
      }
      raf=requestAnimationFrame(draw);
    };
    const onVisibility=()=>{visible=!document.hidden;if(visible&&!raf)raf=requestAnimationFrame(draw);if(!visible&&raf){cancelAnimationFrame(raf);raf=0}};
    const onMotion=(e:MediaQueryListEvent)=>{if(e.matches){cancelAnimationFrame(raf);raf=0;ctx.clearRect(0,0,width,height)}else if(visible&&!raf)raf=requestAnimationFrame(draw)};
    resize();raf=requestAnimationFrame(draw);
    window.addEventListener('resize',resize,{passive:true});
    document.addEventListener('visibilitychange',onVisibility);
    reduced.addEventListener?.('change',onMotion);
    return()=>{cancelAnimationFrame(raf);window.removeEventListener('resize',resize);document.removeEventListener('visibilitychange',onVisibility);reduced.removeEventListener?.('change',onMotion)};
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
    {intro&&<div className="motionIntro" role="dialog" aria-label="مقدمة ثانوية" aria-modal="true">
      <div className="motionIntroGlow"/>
      <div className="motionIntroContent"><div className="motionIntroLogo"><GraduationCap size={43}/></div><span className="motionIntroEyebrow">YOUR NEXT CHAPTER</span><h1>ثانوية</h1><p>خطوة بخطوة، توصل</p><div className="motionIntroLine"><i/></div></div>
      <button className="motionIntroSkip" type="button" onClick={()=>setIntro(false)}><X size={15}/> تخطي المقدمة</button>
    </div>}
  </>;
}
