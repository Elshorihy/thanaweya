import type {Track} from './tracks';

export type CurriculumLesson = {id: string; name: string};
export type CurriculumUnit = {id: string; name: string; lessons: CurriculumLesson[]; granularity: 'lesson' | 'chapter'; note?: string};
export type CurriculumSubject = {id: string; name: string; sourceUrl: string; coverage: 'full-year' | 'term-1'; units: CurriculumUnit[]; note?: string};
export type TrackCurriculum = {track: Track; status: 'partial'; subjects: CurriculumSubject[]; note: string};

export const CURRICULUM_YEAR = '2026-2027';
export const CURRICULUM_VERIFIED_ON = '2026-11-22';
// Ministry-hosted books, inspected in the 2026_2027 library. Some PDFs retain older print dates.
const BOOKS = 'https://elearnningcontent.blob.core.windows.net/elearnningcontent/2026_2027/Secondry/Secondry3/Term1/StudentBook/';
function units(prefix: string, rows: [string, string[]][], granularity: CurriculumUnit['granularity'] = 'lesson'): CurriculumUnit[] {
  return rows.map(([name, names], u) => ({id: `${prefix}-u${u + 1}`, name: granularity === 'chapter' && /^الفصل/.test(name) ? `${name}: ${names[0]}` : name, granularity, lessons: names.map((name, l) => ({id: `${prefix}-u${u + 1}-l${l + 1}`, name}))}));
}
const arabic: CurriculumSubject = {
  id: 'arabic', name: 'اللغة العربية', sourceUrl: BOOKS + 'Arabic_language_Sec3.pdf', coverage: 'full-year',
  note: 'كتاب اللغة العربية فقط. قصة الأيام لها كتاب منفصل لم يدرج هنا. وحدات النحو هي تقسيم الكتاب وليست حصص المدرس.',
  units: units('arabic', [
    ['القراءة العربية', ['إرادة التغيير', 'أبو الريحان البيروني', 'القدس مدينة عربية إسلامية', 'العلم في الإسلام', 'قيم إنسانية']],
    ['الشعر ومدارسه', ['مدرسة الإحياء والبعث وجيل التطوير', 'أحمد شوقي وجيل التطوير', 'غربة وحنين', 'الاتجاه الوجداني', 'المساء', 'مدرسة الديوان', 'في رثاء مي', 'مدرسة أبولو', 'أهواك يا وطني', 'مدرسة المهاجر', 'من أنت يا نفسي', 'الواقعية والشعر الجديد', 'النسور']],
    ['النثر وفنونه', ['المقال', 'التكافل الاجتماعي في الإسلام', 'الرواية', 'القصة القصيرة', 'الكنيسة نورت', 'المسرحية']],
    ['البلاغة: مفاهيم نقدية', ['التجربة الشعرية', 'الوحدة الفنية']],
    ['التدريبات اللغوية', ['النطق والإملاء', 'الأبنية', 'النواسخ', 'في إعراب الاسم', 'في إعراب الفعل', 'الأدوات', 'الممنوع من الصرف', 'تدريبات عامة']]
  ])
};
const english: CurriculumSubject = {
  id: 'english', name: 'اللغة الإنجليزية', sourceUrl: BOOKS + 'English_language_Sec3_tr1.pdf', coverage: 'term-1',
  note: 'الفصل الدراسي الأول فقط. كل وحدة هنا بند دراسة كامل، وليست حصة واحدة. الفصل الثاني غير مضاف.',
  units: units('english', [
    ['Unit 1: Inside the World of Care', ['Inside the World of Care']],
    ['Unit 2: The Power of Machines', ['The Power of Machines']],
    ['Unit 3: Protect Nature, Protect Future', ['Protect Nature, Protect Future']],
    ['Review 1', ['Review 1']],
    ['Unit 4: Marine Life', ['Marine Life']],
    ['Unit 5: From Muscles to Mindset', ['From Muscles to Mindset']],
    ["Unit 6: Let's Hang Out!", ["Let's Hang Out!"]],
    ['Review 2', ['Review 2']]
  ], 'chapter')
};
const chemistry: CurriculumSubject = {
  id: 'chemistry', name: 'الكيمياء', sourceUrl: BOOKS + 'Chemistry_Arabic_Sec3.pdf', coverage: 'full-year',
  note: 'الأبواب الخمسة كاملة على مستوى الأبواب. كل باب بند دراسة واسع، وليس درسًا واحدًا. تقسيم الحصص التفصيلي لم يوثق بعد.',
  units: units('chemistry', [
    ['الباب الأول: العناصر الانتقالية', ['العناصر الانتقالية']],
    ['الباب الثاني: التحليل الكيميائي', ['التحليل الكيميائي']],
    ['الباب الثالث: الاتزان الكيميائي', ['الاتزان الكيميائي']],
    ['الباب الرابع: الكيمياء الكهربية', ['الكيمياء الكهربية']],
    ['الباب الخامس: الكيمياء العضوية', ['الكيمياء العضوية']]
  ], 'chapter')
};
const physics: CurriculumSubject = {
  id: 'physics', name: 'الفيزياء', sourceUrl: BOOKS + 'Physics_Arabic_Sec3.pdf', coverage: 'full-year',
  note: 'الفصول الثمانية كاملة على مستوى الفصول. كل فصل بند دراسة واسع، وليس حصة واحدة. تقسيم الحصص التفصيلي لم يوثق بعد.',
  units: units('physics', [
    ['الفصل الأول', ['التيار الكهربي وقانون أوم وقانونا كيرتشوف']],
    ['الفصل الثاني', ['التأثير المغناطيسي للتيار الكهربي وأجهزة القياس الكهربي']],
    ['الفصل الثالث', ['الحث الكهرومغناطيسي']], ['الفصل الرابع', ['دوائر التيار المتردد']],
    ['الفصل الخامس', ['ازدواجية الموجة والجسيم']], ['الفصل السادس', ['الأطياف الذرية']],
    ['الفصل السابع', ['الليزر']], ['الفصل الثامن', ['الإلكترونيات الحديثة']]
  ], 'chapter')
};
const pureMath: CurriculumSubject = {
  id: 'pure-math', name: 'الرياضيات البحتة', sourceUrl: BOOKS + 'pure_Mathematics_ARABIC_Sec3.pdf', coverage: 'full-year',
  units: units('pure-math', [
    ['الجبر: نظرية ذات الحدين', ['نظرية ذات الحدين بأس صحيح موجب', 'إيجاد الحد المشتمل على س أس ك من مفكوك ذات الحدين', 'النسبة بين حدين متتاليين من مفكوك ذات الحدين']],
    ['الجبر: الأعداد المركبة', ['الصورة المثلثية للعدد المركب', 'نظرية ديموافر', 'الجذور التكعيبية للواحد الصحيح']],
    ['الهندسة والقياس في بعدين وثلاثة أبعاد', ['النظام الإحداثي المتعامد في ثلاثة أبعاد', 'المتجهات في الفراغ', 'ضرب المتجهات']],
    ['الخطوط المستقيمة والمستويات في الفراغ', ['معادلة المستقيم في الفراغ', 'معادلة المستوى في الفراغ']],
    ['التفاضل: الاشتقاق وتطبيقاته', ['الاشتقاق الضمني والبارامتري', 'المشتقات العليا للدالة', 'مشتقات الدوال الأسية واللوغاريتمية', 'المعدلات الزمنية المرتبطة']],
    ['التفاضل: سلوك الدالة ورسم المنحنيات', ['تزايد وتناقص الدوال', 'القيم العظمى والصغرى (القيم القصوى)', 'دراسة المنحنيات', 'تطبيقات على القيم العظمى والصغرى']],
    ['التكامل المحدد وتطبيقاته', ['تكامل الدوال الأسية واللوغاريتمية', 'طرق التكامل', 'التكامل المحدد', 'تطبيقات على التكامل المحدد']]
  ])
};
const appliedMath: CurriculumSubject = {
  id: 'applied-math', name: 'الرياضيات التطبيقية', sourceUrl: BOOKS + 'applied_Mathematics_ARABIC_Sec3.pdf', coverage: 'full-year',
  note: 'متطلبات الاستاتيكا القبلية موسومة في الكتاب: لا يمتحن فيها الطالب، ولذلك لم تضف كدروس امتحان.',
  units: units('applied-math', [
    ['الاستاتيكا: العزوم', ['عزم قوة بالنسبة لنقطة في نظام إحداثي ثنائي الأبعاد']],
    ['الاستاتيكا: القوى المستوية', ['محصلة القوى المتوازية المستوية', 'اتزان مجموعة من القوى المستوية']],
    ['الاستاتيكا: الازدواجات', ['الازدواجات', 'الازدواج المحصل']],
    ['الديناميكا: الحركة في خط مستقيم', ['تفاضل وتكامل الدوال المتجهة']],
    ['الديناميكا: تطبيقات على قوانين نيوتن للحركة', ['حركة الأجسام متغيرة الكتلة أو العجلة', 'حركة الأجسام المتصلة', 'الدفع']],
    ['الديناميكا: الشغل والطاقة والقدرة', ['الشغل', 'الطاقة', 'القدرة']]
  ])
};

export const CURRICULUM: Record<Track, TrackCurriculum> = {
  'علمي رياضة': {track: 'علمي رياضة', status: 'partial', subjects: [arabic, english, chemistry, physics, pureMath, appliedMath], note: 'الرياضيات مفصلة حسب فهرس الكتاب. الكيمياء والفيزياء والإنجليزي على مستوى الأبواب والوحدات. إنجليزي ترم أول فقط، وقصة الأيام غير مضافة.'},
  'علمي علوم': {track: 'علمي علوم', status: 'partial', subjects: [arabic, english, chemistry, physics], note: 'المواد المشتركة المتحققة فقط. الأحياء غير مضافة بعد. إنجليزي ترم أول فقط، وقصة الأيام غير مضافة.'},
  'أدبي': {track: 'أدبي', status: 'partial', subjects: [arabic, english], note: 'العربي والإنجليزي فقط. مواد الشعبة الأخرى غير مضافة بعد. إنجليزي ترم أول فقط، وقصة الأيام غير مضافة.'}
};

// Pure additive adapter. Never replaces existing lessons, progress, tasks or references.
// Skip an entire existing subject by stable ID OR normalized name to avoid duplicate imported curricula.
export function buildCurriculumSeed(track: Track, existing: {id: string; name: string}[]) {
  const normalize = (name: string) => name.normalize('NFKC').replace(/[أإآ]/g, 'ا').replace(/\s+/g, '').toLowerCase();
  const present = new Set(existing.map(s => normalize(s.name)));
  const subjects: {id: string; name: string; color: string; priority: 'medium'}[] = [];
  const resultUnits: {id: string; subjectId: string; name: string}[] = [];
  const lessons: {id: string; unitId: string; name: string; estimatedMinutes: number; status: 'not_started'; priority: 'medium'}[] = [];
  for (const subject of CURRICULUM[track].subjects) {
    const sid = `moe-2026-2027-${subject.id}`;
    if (existing.some(s => s.id === sid) || present.has(normalize(subject.name))) continue;
    subjects.push({id: sid, name: subject.name, color: '#7C3AED', priority: 'medium'});
    for (const unit of subject.units) {
      const uid = `moe-2026-2027-${unit.id}`;
      resultUnits.push({id: uid, subjectId: sid, name: unit.name});
      // A whole science chapter/English unit must not become a fake 45-minute lesson.
      if (unit.granularity === 'chapter') continue;
      for (const lesson of unit.lessons) lessons.push({id: `moe-2026-2027-${lesson.id}`, unitId: uid, name: lesson.name, estimatedMinutes: 45, status: 'not_started', priority: 'medium'});
    }
  }
  return {subjects, units: resultUnits, lessons};
}
