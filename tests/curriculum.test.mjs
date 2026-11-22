import test from 'node:test';
import assert from 'node:assert/strict';
import {TRACKS, resolveTrack} from '../src/data/tracks.ts';
import {CURRICULUM, buildCurriculumSeed} from '../src/data/curriculum.ts';

test('known track spellings resolve without guessing unknown values', () => {
  assert.equal(TRACKS.length, 3);
  for (const value of ['علمي رياضة', 'علمى رياضه', ' علمي  رياضة ', 'علمي رياضيات']) assert.equal(resolveTrack(value), 'علمي رياضة');
  assert.equal(resolveTrack('ادبى'), 'أدبي');
  assert.equal(resolveTrack('علمى علوم'), 'علمي علوم');
  assert.equal(resolveTrack('علمي'), undefined);
  assert.equal(resolveTrack('custom legacy value'), undefined);
  assert.equal(resolveTrack(undefined), undefined);
});
test('seed has stable unique IDs and complete parent references', () => {
  for (const track of TRACKS) {
    const seed = buildCurriculumSeed(track, []);
    const ids = [...seed.subjects, ...seed.units, ...seed.lessons].map(x => x.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(seed.units.every(u => seed.subjects.some(s => s.id === u.subjectId)));
    assert.ok(seed.lessons.every(l => seed.units.some(u => u.id === l.unitId)));
    assert.deepEqual(seed, buildCurriculumSeed(track, []));
    assert.ok(seed.lessons.every(l => l.status === 'not_started'));
    assert.deepEqual(buildCurriculumSeed(track, seed.subjects, seed.units, seed.lessons), {subjects: [], units: [], lessons: []});
  }
});
test('existing custom subjects are untouched and name-matched imports are skipped', () => {
  const existing = [{id: 'my-arabic', name: 'اللغة العربية'}];
  const before = JSON.stringify(existing);
  const seed = buildCurriculumSeed('علمي رياضة', existing);
  assert.equal(JSON.stringify(existing), before);
  assert.equal(seed.subjects.some(s => s.name === 'اللغة العربية'), false);
  assert.equal(seed.subjects.length, 5);
});
test('coverage limits and official source links remain explicit', () => {
  for (const track of TRACKS) {
    assert.equal(CURRICULUM[track].status, 'partial');
    for (const subject of CURRICULUM[track].subjects) assert.ok(subject.sourceUrl.startsWith('https://elearnningcontent.blob.core.windows.net/elearnningcontent/2026_2027/'));
  }
  const subjects = CURRICULUM['علمي رياضة'].subjects;
  assert.equal(subjects.find(s => s.id === 'english').coverage, 'term-1');
  assert.equal(subjects.find(s => s.id === 'chemistry').units.length, 5);
  assert.equal(subjects.find(s => s.id === 'physics').units.length, 8);
  assert.equal(subjects.find(s => s.id === 'pure-math').units.flatMap(u => u.lessons).length, 23);
  assert.equal(subjects.find(s => s.id === 'applied-math').units.flatMap(u => u.lessons).length, 12);
  assert.ok(subjects.find(s => s.id === 'chemistry').units.every(u => u.granularity === 'topic'));
});

test('English units do not become misleading single lessons', () => {
  const seed = buildCurriculumSeed('علمي رياضة', []);
  assert.equal(seed.lessons.some(l => /moe-2026-2027-(english)-/.test(l.id)), false);
  assert.ok(seed.units.some(u => u.name.includes('قانون أوم')));
});

test('science topic splits carry source PDF page anchors', () => {
  for(const subject of CURRICULUM['علمي رياضة'].subjects.filter(s => ['chemistry','physics'].includes(s.id))) {
    assert.ok(subject.units.every(u => u.granularity === 'topic' && u.lessons.length > 0));
    assert.ok(subject.units.flatMap(u => u.lessons).every(l => Number.isInteger(l.pdfPage) && l.pdfPage > 0));
  }
});

test('merges missing topics into existing subjects without changing completed lessons', () => {
 const first=buildCurriculumSeed('علمي رياضة', []);
 const saved={...first.lessons[0],status:'completed',estimatedMinutes:90};
 const input=JSON.stringify(saved);
 const seed=buildCurriculumSeed('علمي رياضة',first.subjects,first.units,[saved]);
 assert.equal(seed.subjects.length,0);assert.equal(seed.units.length,0);
 assert.equal(seed.lessons.length,first.lessons.length-1);
 assert.equal(seed.lessons.some(l=>l.id===saved.id),false);assert.equal(JSON.stringify(saved),input);
});

test('all three tracks have their own current core subjects without cross-track leakage',()=>{
 const ids=track=>CURRICULUM[track].subjects.map(s=>s.id).sort();
 assert.deepEqual(ids('علمي علوم'),['arabic','biology','chemistry','english','physics']);
 assert.deepEqual(ids('أدبي'),['arabic','english','geography','history','statistics']);
 assert.deepEqual(ids('علمي رياضة'),['applied-math','arabic','chemistry','english','physics','pure-math']);
 for(const t of TRACKS)assert.ok(!ids(t).some(id=>['geology','philosophy','psychology'].includes(id)));
});
test('new biology and literary books have verified usable entries rather than empty placeholders',()=>{
 const science=CURRICULUM['علمي علوم'].subjects.find(s=>s.id==='biology');
 assert.equal(science.units.length,7);assert.equal(science.units.flatMap(u=>u.lessons).length,48);
 assert.ok(science.units.some(u=>u.name==='الأحياء وعلوم الأرض'));
 const literary=CURRICULUM['أدبي'].subjects;
 for(const [id,count] of [['history',25],['geography',14],['statistics',15]])assert.equal(literary.find(s=>s.id===id).units.flatMap(u=>u.lessons).length,count);
 assert.equal(buildCurriculumSeed('علمي علوم',[]).lessons.length,173);
 assert.equal(buildCurriculumSeed('أدبي',[]).lessons.length,88);
});
test('changing tracks keeps completed existing work and adds only the other track subjects',()=>{
 const original=buildCurriculumSeed('علمي علوم',[]);original.lessons[0].status='completed';
 const before=JSON.stringify(original);
 const add=buildCurriculumSeed('أدبي',original.subjects,original.units,original.lessons);
 assert.deepEqual(add.subjects.map(s=>s.name),['التاريخ','الجغرافيا','الإحصاء']);
 assert.equal(JSON.stringify(original),before);
 const merged={subjects:[...original.subjects,...add.subjects],units:[...original.units,...add.units],lessons:[...original.lessons,...add.lessons]};
 assert.deepEqual(buildCurriculumSeed('علمي علوم',merged.subjects,merged.units,merged.lessons),{subjects:[],units:[],lessons:[]});
});
