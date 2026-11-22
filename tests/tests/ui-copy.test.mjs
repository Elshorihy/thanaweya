import test from 'node:test';
import assert from 'node:assert/strict';
import {createTranslator, publicCopy, UI_COPY, STUDY_COPY, SECTION_COPY} from '../src/uiCopy.ts';

const translate=createTranslator({...UI_COPY,...STUDY_COPY,...SECTION_COPY});
test('long phrases win over shorter fragments, including padded legacy keys',()=>{
 const t=createTranslator({' دقيقة':'minutes','دقيقة للجلسة':'minutes per session',' من':'of','من الجهاز القديم اضغط نقل':'On your old device, select Transfer'});
 assert.equal(t(' دقيقة للجلسة'),' minutes per session');
 assert.equal(t('من الجهاز القديم اضغط نقل'),'On your old device, select Transfer');
});
test('translations are single-pass and do not match inside words',()=>{
 const t=createTranslator({'درس':'Lesson','Lesson':'Changed'});
 assert.equal(t('درس'),'Lesson');
 assert.equal(t('مدرسة'),'مدرسة');
});
test('unknown sentences stay intact instead of becoming half English',()=>{
 const t=createTranslator({'مادة':'Subject'});
 assert.equal(t('مادة جديدة غير معروفة'),'مادة جديدة غير معروفة');
});
test('public copy is reversible without translating the source strings',()=>{
 assert.equal(publicCopy('ابدأ مجانًا','en'),'Get started free');
 assert.equal(publicCopy('ابدأ مجانًا','ar'),'ابدأ مجانًا');
 assert.equal(publicCopy('custom text','en'),'custom text');
});
test('copy uses the email verification route and consistent calls to action',()=>{
 assert.equal(translate('إرسال كود التأكيد'),'Send verification code');
 assert.match(translate('مطلوب لربط حسابك برقم واتساب. كود تأكيد الحساب بيجيلك على الإيميل.'),/sent by email/);
 assert.equal(translate('ابدأ رحلتك'),'Get started free');
});
test('main study screens have complete phrase translations',()=>{
 for(const text of ['مفيش مراجعات مستحقة.','خريطة نشاطك','إنشاء الاختبار','جهّز جلستك','غرف المذاكرة','أولياء الأمور المرتبطون']){
  assert.doesNotMatch(translate(text),/[\u0621-\u064a]/u);
 }
});
