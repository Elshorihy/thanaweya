import {CURRICULUM, CURRICULUM_YEAR} from './data/curriculum';
import {resolveTrack} from './data/tracks';

export default function CurriculumStarter({section, onAdd, language}: {section: string; onAdd: () => void; language: 'ar' | 'en'}) {
  const track = resolveTrack(section);
  const en = language === 'en';
  return <section className="card curriculumStarter" aria-labelledby="curriculumStarterTitle">
    <h2 id="curriculumStarterTitle">{en ? 'Ready curriculum' : 'منهج جاهز'} {CURRICULUM_YEAR}</h2>
    {!track ? <p>{en ? 'Choose your track in Profile settings first.' : 'اختار شعبتك من إعدادات الملف الشخصي الأول.'}</p> : <>
      <p translate="no">{track}</p>
      <p>{en ? 'Partial seed from verified books. Science entries are study-topic splits, not official lesson numbering. Missing books and finer lesson splits are not included.' : CURRICULUM[track].note}</p>
      <p>{en ? 'Adds missing subjects, units and lessons only. Existing subjects, lessons and progress stay unchanged. English units are added without lessons so you can split them to match your classes. The 45-minute default is editable, not a ministry estimate.' : 'هنضيف المواد والوحدات والدروس الناقصة بس، من غير تغيير دروسك أو تقدمك. تقسيم العلوم موضوعات للمذاكرة، مش ترقيم حصص رسمي. وحدات الإنجليزي فاضية عشان تقسمها لدروسك. الـ٤٥ دقيقة وقت افتراضي قابل للتعديل، مش تقدير من الوزارة.'}</p>
      <button className="primary" onClick={onAdd}>{en ? 'Add ready curriculum' : 'إضافة المنهج الجاهز'}</button>
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
