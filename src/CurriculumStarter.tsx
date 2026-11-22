import {CURRICULUM, CURRICULUM_YEAR} from './data/curriculum';
import {resolveTrack} from './data/tracks';

export default function CurriculumStarter({section, onAdd, language}: {section: string; onAdd: () => void; language: 'ar' | 'en'}) {
  const track = resolveTrack(section);
  const en = language === 'en';
  return <section className="card curriculumStarter" aria-labelledby="curriculumStarterTitle">
    <h2 id="curriculumStarterTitle">{en ? 'Ready curriculum' : 'منهج جاهز'} {CURRICULUM_YEAR}</h2>
    {!track ? <p>{en ? 'Choose your track in Profile settings first.' : 'اختار شعبتك من إعدادات الملف الشخصي الأول.'}</p> : <>
      <p translate="no">{track}</p>
      <p>{en ? 'Partial seed: math lessons, Arabic contents, science chapters and English term-1 units. Missing books and finer lesson splits are not included.' : CURRICULUM[track].note}</p>
      <p>{en ? 'Adds missing subjects only. Existing subjects, lessons and progress stay unchanged. Science chapters and English units are added as empty units so you can split them into your own lessons. The 45-minute default is editable, not a ministry estimate.' : 'هنضيف المواد الناقصة بس، من غير تغيير دروسك أو تقدمك. أبواب العلوم ووحدات الإنجليزي هتتضاف كوحدات فاضية، قسمها لدروسك بنفسك. الـ٤٥ دقيقة وقت افتراضي قابل للتعديل، مش تقدير من الوزارة.'}</p>
      <button className="primary" onClick={onAdd}>{en ? 'Add missing subjects' : 'إضافة المواد الناقصة'}</button>
      <details><summary>{en ? 'Books and coverage' : 'الكتب وحدود التغطية'}</summary>
        <ul>{CURRICULUM[track].subjects.map(subject => <li key={subject.id}>
          <a translate="no" href={subject.sourceUrl} target="_blank" rel="noopener noreferrer">{subject.name} ↗</a>
          <p>{en ? (subject.coverage === 'term-1' ? 'Term 1 only' : 'Full-year book') : (subject.coverage === 'term-1' ? 'ترم أول فقط' : 'كتاب سنة كاملة')}</p>
          {subject.note && <p translate="no">{subject.note}</p>}
        </li>)}</ul>
      </details>
    </>}
  </section>;
}
