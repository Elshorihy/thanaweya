// Study-topic splits from chapter headings and content, not official numbered lessons.
// pdfPage is the 1-based page in the linked PDF, not the printed page number.
const SCIENCE_TOPICS: Record<string, [string, number][][]> = {
  chemistry: [
    [['العناصر الانتقالية وموقعها في الجدول الدوري',7],['السلسلة الانتقالية الأولى واستخدامات عناصرها',8],['التركيب الإلكتروني وحالات التأكسد',10],['خواص عناصر السلسلة الانتقالية الأولى',12],['استخلاص الحديد وإنتاجه',16],['السبائك وأنواعها',19],['الحديد وأكاسيده وخواصها',21]],
    [['التحليل الكيميائي الوصفي والكمي',32],['الكشف عن الأنيونات (الشقوق الحمضية)',33],['الكشف عن الكاتيونات (الشقوق القاعدية)',37],['التحليل الحجمي والمعايرة',40],['الأدلة الكيميائية والحسابات الحجمية',41],['التحليل الكتلي: التطاير والترسيب',44]],
    [['الاتزان الديناميكي والتفاعلات الانعكاسية',51],['سرعة التفاعل الكيميائي والعوامل المؤثرة فيها',53],['قانون فعل الكتلة وثابت الاتزان',55],['العوامل المؤثرة على الاتزان الكيميائي',57],['الاتزان الأيوني والتأين',61],['قانون التخفيف لأستفالد',64],['حساب تركيز أيونات الأحماض والقواعد',66],['الحاصل الأيوني للماء والأس الهيدروجيني',68],['حاصل الإذابة',70]],
    [['الأكسدة والاختزال والخلايا الجلفانية',77],['جهود الأقطاب وقطب الهيدروجين القياسي',81],['السلسلة الكهروكيميائية',82],['أنواع الخلايا الجلفانية وتطبيقاتها',84],['تآكل المعادن وحماية الحديد من الصدأ',90],['الخلايا الإلكتروليتية والتحليل الكهربي',93],['قانونا فاراداي والحسابات الكهروكيميائية',95],['تطبيقات التحليل الكهربي',98]],
    [['مقدمة الكيمياء العضوية وخصائص المركبات العضوية',107],['الصيغ الكيميائية والتشاكل والكشف عن العناصر',110],['تصنيف الهيدروكربونات',114],['الألكانات وتسميتها والميثان',115],['الألكينات والإيثين',123],['البلمرة بالإضافة',128],['الألكاينات والإيثاين',131],['الهيدروكربونات الأروماتية والبنزين',135],['المجموعات الوظيفية',149],['الكحولات: التسمية والتصنيف والتحضير والخواص',150],['الكحولات عديدة الهيدروكسيل والفينولات',162],['الأحماض الكربوكسيلية',169],['الإسترات والتصبن وتطبيقاتها',179]]
  ],
  physics: [
    [['التيار الكهربي وفرق الجهد والمقاومة وقانون أوم',9],['توصيل المقاومات على التوالي والتوازي',10],['القوة الدافعة الكهربية والمقاومة الداخلية',14],['حسابات الدوائر الكهربية',16],['قانونا كيرتشوف',19]],
    [['المجال المغناطيسي لتيار في سلك مستقيم',32],['المجال المغناطيسي للملف الدائري',35],['المجال المغناطيسي للملف اللولبي',37],['القوة المغناطيسية المؤثرة على سلك يمر به تيار',39],['عزم الازدواج المؤثر على ملف يمر به تيار',43],['الجلفانومتر ذو الملف المتحرك',45],['الأميتر والفولتميتر',47],['الأوميتر',50]],
    [['الحث الكهرومغناطيسي وقانون فاراداي',61],['قاعدة لنز',64],['الحث المتبادل',65],['الحث الذاتي',68],['القوة الدافعة المستحثة في سلك مستقيم',71],['الدينامو والقيمة الفعالة للتيار المتردد',72],['المحول الكهربي',79],['المحرك الكهربي',84]],
    [['دائرة مقاومة أومية والأميتر الحراري',96],['دائرة ملف حث',98],['دائرة مكثف وتوصيل المكثفات',100],['دوائر المقاومة والملف والمكثف على التوالي',103],['الدائرة المهتزة',106],['دائرة الرنين',108]],
    [['إشعاع الجسم الأسود وفرض بلانك',114],['التأثير الكهروضوئي',118],['ظاهرة كومتون وكمية حركة الفوتون',120],['الطبيعة الموجية للجسيم',123],['المجهر الإلكتروني',124]],
    [['نموذج بور للذرة',128],['مستويات الطاقة وطيف ذرة الهيدروجين',130],['المطياف',133],['طيف الامتصاص',134],['الأشعة السينية',135]],
    [['الانبعاث التلقائي والانبعاث المستحث',141],['خصائص أشعة الليزر',143],['عناصر جهاز الليزر وليزر الهيليوم نيون',148],['تطبيقات الليزر والتصوير المجسم',155]],
    [['البلورات والتوصيل الكهربي في المواد',161],['أشباه الموصلات النقية',162],['أشباه الموصلات غير النقية والتطعيم',165],['الوصلة الثنائية وتطبيقاتها',168],['الترانزستور',172],['الإلكترونيات التناظرية والرقمية',175],['البوابات المنطقية',176]]
  ]
};

import type {Track} from './tracks';

export type CurriculumLesson = {id: string; name: string; pdfPage?: number};
export type CurriculumUnit = {id: string; name: string; lessons: CurriculumLesson[]; granularity: 'lesson' | 'topic' | 'chapter'; note?: string};
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
  note: 'الأبواب الخمسة مقسمة لموضوعات مذاكرة من محتوى الكتاب. التقسيم ليس ترقيم دروس رسميًا، وأرقام الصفحات هي صفحات ملف PDF.',
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
  note: 'الفصول الثمانية مقسمة لموضوعات مذاكرة من محتوى الكتاب. التقسيم ليس ترقيم دروس رسميًا، وأرقام الصفحات هي صفحات ملف PDF.',
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

for (const subject of [chemistry, physics]) {
  subject.units.forEach((unit, u) => {
    unit.granularity = 'topic';
    unit.lessons = SCIENCE_TOPICS[subject.id][u].map(([name, pdfPage], l) => ({id: `${subject.id}-u${u + 1}-l${l + 1}`, name, pdfPage}));
  });
}

export const CURRICULUM: Record<Track, TrackCurriculum> = {
  'علمي رياضة': {track: 'علمي رياضة', status: 'partial', subjects: [arabic, english, chemistry, physics, pureMath, appliedMath], note: 'الرياضيات مفصلة حسب فهرس الكتاب. الكيمياء والفيزياء مقسمتان لموضوعات مذاكرة، والإنجليزي على مستوى الوحدات. إنجليزي ترم أول فقط، وقصة الأيام غير مضافة.'},
  'علمي علوم': {track: 'علمي علوم', status: 'partial', subjects: [arabic, english, chemistry, physics], note: 'المواد المشتركة المتحققة فقط. الأحياء غير مضافة بعد. إنجليزي ترم أول فقط، وقصة الأيام غير مضافة.'},
  'أدبي': {track: 'أدبي', status: 'partial', subjects: [arabic, english], note: 'العربي والإنجليزي فقط. مواد الشعبة الأخرى غير مضافة بعد. إنجليزي ترم أول فقط، وقصة الأيام غير مضافة.'}
};

// Pure additive adapter. Never replaces existing lessons, progress, tasks or references.
// Reuse matching subject/unit IDs and append only missing entries. Keep all existing progress untouched.
export function buildCurriculumSeed(track: Track, existing: {id: string; name: string}[], existingUnits: {id: string; subjectId: string; name: string}[] = [], existingLessons: {id: string; unitId: string; name: string}[] = []) {
  const normalize = (name: string) => name.normalize('NFKC').replace(/[أإآ]/g, 'ا').replace(/\s+/g, '').toLowerCase();
  const subjects: {id: string; name: string; color: string; priority: 'medium'}[] = [];
  const resultUnits: {id: string; subjectId: string; name: string}[] = [];
  const lessons: {id: string; unitId: string; name: string; estimatedMinutes: number; status: 'not_started'; priority: 'medium'}[] = [];
  for (const subject of CURRICULUM[track].subjects) {
    const seedId = `moe-2026-2027-${subject.id}`;
    const savedSubject = existing.find(s => s.id === seedId || normalize(s.name) === normalize(subject.name));
    const sid = savedSubject?.id || seedId;
    if (!savedSubject) subjects.push({id: sid, name: subject.name, color: '#7C3AED', priority: 'medium'});
    for (const unit of subject.units) {
      const unitSeedId = `moe-2026-2027-${unit.id}`;
      const savedUnit = existingUnits.find(u => u.subjectId === sid && (u.id === unitSeedId || normalize(u.name) === normalize(unit.name)));
      const uid = savedUnit?.id || unitSeedId;
      if (!savedUnit) resultUnits.push({id: uid, subjectId: sid, name: unit.name});
      // A whole English unit must not become a fake 45-minute lesson.
      if (unit.granularity === 'chapter') continue;
      for (const lesson of unit.lessons) {
        const lid = `moe-2026-2027-${lesson.id}`;
        if (!existingLessons.some(l => l.id === lid || (l.unitId === uid && normalize(l.name) === normalize(lesson.name)))) lessons.push({id: lid, unitId: uid, name: lesson.name, estimatedMinutes: 45, status: 'not_started', priority: 'medium'});
      }
    }
  }
  return {subjects, units: resultUnits, lessons};
}
