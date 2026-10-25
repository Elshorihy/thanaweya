import React, { useEffect, useRef, useState } from 'react';
import { Gamepad2, Play, RotateCcw, Trophy, ArrowRight, ArrowLeft, Sparkles } from 'lucide-react';
import './games.css';

type Rock = { x: number; y: number; r: number; speed: number };
export default function GamesHub() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const keysRef = useRef({ left: false, right: false });
  const gameRef = useRef({ running: false, player: 400, rocks: [] as Rock[], score: 0, tick: 0, over: false });
  const [running, setRunning] = useState(false);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => { try { return Number(localStorage.getItem('thanaweya_arcade_best') || 0); } catch { return 0; } });
  const [over, setOver] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let alive = true;
    const draw = () => {
      if (!alive) return;
      const g = gameRef.current;
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const bg = ctx.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, '#10152c'); bg.addColorStop(1, '#17102b');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(123,145,255,.10)'; ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 40) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
      for (let y = 0; y < h; y += 40) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
      for (let i = 0; i < 34; i++) {
        const x = (i * 137 + 19) % w, y = (i * 71 + g.tick * .25) % h;
        ctx.fillStyle = 'rgba(210,220,255,.6)'; ctx.fillRect(x,y,2,2);
      }
      g.rocks.forEach(a => {
        ctx.save(); ctx.shadowColor = '#fb7185'; ctx.shadowBlur = 16;
        ctx.fillStyle = '#fb7185'; ctx.beginPath(); ctx.arc(a.x,a.y,a.r,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#fecdd3'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
      });
      ctx.save(); ctx.shadowColor = '#67e8f9'; ctx.shadowBlur = 24;
      ctx.fillStyle = '#67e8f9'; ctx.beginPath(); ctx.moveTo(g.player, h-54); ctx.lineTo(g.player-20,h-18); ctx.lineTo(g.player,h-27); ctx.lineTo(g.player+20,h-18); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#e0f2fe'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
      ctx.fillStyle = '#f8fafc'; ctx.font = 'bold 18px system-ui'; ctx.textAlign = 'left'; ctx.fillText('SCORE  ' + g.score, 20, 30);
      if (g.running && !g.over) {
        g.tick++;
        if (keysRef.current.left) g.player = Math.max(25, g.player - 5.5);
        if (keysRef.current.right) g.player = Math.min(w-25, g.player + 5.5);
        if (g.tick % Math.max(14, 38 - Math.floor(g.score/7)) === 0) g.rocks.push({ x: 20 + Math.random()*(w-40), y: -18, r: 8 + Math.random()*10, speed: 2.3 + Math.random()*1.8 + g.score*.012 });
        g.rocks.forEach(a => a.y += a.speed);
        g.rocks = g.rocks.filter(a => a.y < h+25);
        for (const a of g.rocks) {
          if (Math.hypot(a.x-g.player, a.y-(h-31)) < a.r+13) {
            g.over = true; g.running = false; setRunning(false); setOver(true);
            setBest(old => { const next = Math.max(old, g.score); try { localStorage.setItem('thanaweya_arcade_best', String(next)); } catch {} return next; });
            break;
          }
        }
        if (g.tick % 6 === 0) { g.score++; setScore(g.score); }
      }
      frameRef.current = requestAnimationFrame(draw);
    };
    frameRef.current = requestAnimationFrame(draw);
    const down = (e: KeyboardEvent) => { if (['ArrowLeft','ArrowRight','a','d','A','D'].includes(e.key)) e.preventDefault(); if (['ArrowLeft','a','A'].includes(e.key)) keysRef.current.left = true; if (['ArrowRight','d','D'].includes(e.key)) keysRef.current.right = true; };
    const up = (e: KeyboardEvent) => { if (['ArrowLeft','a','A'].includes(e.key)) keysRef.current.left = false; if (['ArrowRight','d','D'].includes(e.key)) keysRef.current.right = false; };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { alive = false; cancelAnimationFrame(frameRef.current); window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  const start = () => {
    gameRef.current = { running: true, player: 400, rocks: [], score: 0, tick: 0, over: false };
    setScore(0); setOver(false); setRunning(true);
  };
  const hold = (side: 'left'|'right', value: boolean) => { keysRef.current[side] = value; };
  return <section className="gamesHub" dir="rtl">
    <div className="gamesHero">
      <div className="gamesHeroCopy"><span className="gamesEyebrow"><Gamepad2 size={15}/> THANOWEYA ARCADE</span><h1>وقت اللعب 🎮</h1><p>استراحة صغيرة تفصل بيها دماغك وترجع للمذاكرة بطاقة أحسن. العب، سجّل رقمك القياسي، وارجع كمل.</p><div className="gamesHeroStats"><span><Sparkles size={16}/> ألعاب خفيفة</span><span><Trophy size={16}/> أفضل نتيجة: {best}</span></div></div>
      <div className="gamesOrb" aria-hidden="true"><span>✦</span><i>🎮</i></div>
    </div>
    <div className="gamesSectionHeading"><div><span className="gamesEyebrow">PLAY NOW</span><h2>الألعاب المتاحة</h2></div><span className="gamesCount">01 لعبة</span></div>
    <article className="arcadeGameCard">
      <div className="arcadeCardTop"><div className="arcadeGameIcon">☄️</div><div className="arcadeCardTitle"><span className="arcadeTag">ARCADE · مهارة</span><h3>نجم النجاة</h3><p>تفادى النيازك لأطول وقت ممكن — كل ثانية بتعدّي بتقرّبك من رقم قياسي جديد.</p></div></div>
      <div className="arcadeStats"><span>🎯 الهدف: تفادي النيازك</span><span>⌨️ الأسهم أو A / D</span><span>📱 أزرار لمس للموبايل</span></div>
      <div className="arcadeCanvasWrap"><canvas ref={canvasRef} width={800} height={400} aria-label="لعبة تفادي النيازك" />{!running&&<div className="arcadeOverlay"><div className="arcadeOverlayIcon">{over?'💥':'🚀'}</div><h3>{over?'انتهت الجولة!':'جاهز تنطلق؟'}</h3><p>{over?'نتيجتك: '+score+' نقطة — جرّب تكسر رقمك.':'حرّك سفينتك يمين وشمال وتفادى النيازك الحمراء.'}</p><button className="arcadeStartBtn" onClick={start}>{over?<RotateCcw size={17}/>:<Play size={17}/>} {over?'العب تاني':'ابدأ اللعب'}</button></div>}</div>
      <div className="arcadeGameFooter"><div><span>نتيجتك</span><strong>{score}</strong></div><div><span>أفضل نتيجة</span><strong>{best}</strong></div><div className="arcadeTouchControls"><button aria-label="تحرك شمال" onPointerDown={()=>hold('left',true)} onPointerUp={()=>hold('left',false)} onPointerLeave={()=>hold('left',false)}><ArrowRight size={20}/></button><button aria-label="تحرك يمين" onPointerDown={()=>hold('right',true)} onPointerUp={()=>hold('right',false)} onPointerLeave={()=>hold('right',false)}><ArrowLeft size={20}/></button></div></div>
    </article>
    <div className="gamesComingSoon"><span>✨</span><div><strong>المزيد جاي في الطريق</strong><p>هنضيف ألعاب تانية وتحديات بأعلى نتيجة، مع الحفاظ على إن القسم خفيف وسريع على الموبايل والتابلت.</p></div></div>
    <p className="gamesReminder">💡 خُدها استراحة قصيرة، وبعدها ارجع لهدفك الأساسي: إنك تخلص اللي وراك.</p>
  </section>;
}
