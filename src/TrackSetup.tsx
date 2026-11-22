import {useState} from 'react';
import TrackSelect from './TrackSelect';
import {CURRICULUM} from './data/curriculum';
import {resolveTrack} from './data/tracks';

export default function TrackSetup({language, ready, failed, onConfirm}: {language: 'ar' | 'en'; ready: boolean; failed: boolean; onConfirm: (track: string) => void}) {
  const [choice, setChoice] = useState('');
  const track = resolveTrack(choice);
  const en = language === 'en';
  return <main className="trackSetup" dir={en ? 'ltr' : 'rtl'} style={{minHeight:'100dvh',display:'grid',placeItems:'center',padding:24}}>
    <section className="card" style={{width:'100%',maxWidth:480}} aria-labelledby="trackSetupTitle">
      <h1 id="trackSetupTitle">{en ? 'Choose your study track first' : 'اختار شعبتك الأول'}</h1>
      {!ready ? <><p role="status">{failed ? (en ? 'Your saved data could not be loaded. Retry before making changes.' : 'مش قادرين نحمل بياناتك المحفوظة. حاول تاني قبل ما نغير أي حاجة.') : (en ? 'Loading your saved progress…' : 'بنحمّل تقدمك المحفوظ…')}</p>{failed && <button onClick={()=>location.reload()}>{en ? 'Retry' : 'حاول تاني'}</button>}</> : <>
        <p>{en ? 'Confirm your track to continue. Its ready curriculum is added automatically without replacing your progress.' : 'أكد شعبتك عشان تكمل. المنهج الجاهز هينزل تلقائي من غير ما يغير تقدمك.'}</p>
        <label>{en ? 'Study track' : 'الشعبة'}<TrackSelect value={choice} onChange={setChoice}/></label>
        {track && <p translate="no" className="muted">{CURRICULUM[track].note}</p>}
        <button className="primary wide" disabled={!track} onClick={()=>track && onConfirm(track)}>{en ? 'Confirm track and continue' : 'تأكيد الشعبة والمتابعة'}</button>
      </>}
    </section>
  </main>;
}
