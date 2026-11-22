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
    assert.deepEqual(buildCurriculumSeed(track, seed.subjects), {subjects: [], units: [], lessons: []});
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
  assert.ok(subjects.find(s => s.id === 'chemistry').units.every(u => u.granularity === 'chapter'));
});

test('chapter-sized entries do not become misleading 45-minute lessons', () => {
  const seed = buildCurriculumSeed('علمي رياضة', []);
  assert.equal(seed.lessons.some(l => /moe-2026-2027-(chemistry|physics|english)-/.test(l.id)), false);
  assert.ok(seed.units.some(u => u.name.includes('قانون أوم')));
});
