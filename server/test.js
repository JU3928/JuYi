const http = require('http');
const BASE = 'http://localhost:3000/api';
let pass = 0, fail = 0;

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(BASE + path);
    const opts = { hostname: u.hostname, port: u.port, path: u.pathname + u.search, method, headers: { 'Content-Type': 'application/json' } };
    const r = http.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch (e) { resolve({ status: res.statusCode, raw: d }); }
      });
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

function check(label, ok) {
  if (ok) { pass++; console.log('  PASS', label); }
  else { fail++; console.log('  FAIL', label); }
}

// Clean all data first
async function cleanAll() {
  const r = await req('GET', '/errors');
  if (Array.isArray(r.body)) {
    for (const item of r.body) {
      await req('DELETE', '/errors/' + item.id);
    }
  }
}

async function main() {
  console.log('========================================');
  console.log(' JuYi Error Notebook - Full Test Suite');
  console.log('========================================\n');

  // Clean start
  await cleanAll();
  let r0 = await req('GET', '/errors');
  check('0.  Clean DB -> empty', Array.isArray(r0.body) && r0.body.length === 0);

  let r, ids = [];

  // ========== 1. Ping ==========
  r = await req('GET', '/ping');
  check('1.  Ping', r.body && r.body.ok);

  // ========== 2. Create 4 items ==========
  const items = [
    { subject: 'Math', difficulty: 4, question: '<p>Integral of <b>x^2</b></p><img src="data:image/png;base64,test1">', answer: '<p>x^3/3 + C</p>', tags: ['calc', 'formula'], source: '2024 Exam' },
    { subject: 'Politics', difficulty: 2, question: '<p>What is contradiction?</p>', answer: '<p>Universal in specific</p>', tags: ['philosophy'], source: 'Textbook' },
    { subject: 'English', difficulty: 3, question: '<p><i>Ubiquitous</i> means?</p>', answer: '<p>Everywhere, omnipresent</p>', tags: ['vocab'], source: 'Reading' },
    { subject: 'CS', difficulty: 5, question: '<p>Empty links in binary tree with n nodes?</p>', answer: '<p>n+1 empty links</p>', tags: ['ds', 'formula'], source: '408 Exam' },
  ];
  for (const item of items) {
    r = await req('POST', '/errors', item);
    if (r.status === 201 && r.body && r.body.id) {
      ids.push(r.body.id);
      check('2a. Create ' + item.subject, true);
    } else {
      check('2a. Create ' + item.subject, false);
    }
  }
  check('2b. All 4 created', ids.length === 4);

  // ========== 3. Get by ID ==========
  r = await req('GET', '/errors/' + ids[0]);
  check('3a. Get by ID -> subject=Math', r.body && r.body.subject === 'Math');
  check('3b. Get by ID -> difficulty=4', r.body && r.body.difficulty === 4);
  check('3c. Has question HTML', r.body && r.body.question && r.body.question.includes('<img'));
  check('3d. Has answer', r.body && r.body.answer && r.body.answer.includes('x^3'));

  // ========== 4. List ==========
  r = await req('GET', '/errors');
  check('4.  List returns 4 items', Array.isArray(r.body) && r.body.length === 4);

  // ========== 5. Subject filter ==========
  r = await req('GET', '/errors?subject=Math');
  check('5a. Filter subject=Math -> 1', Array.isArray(r.body) && r.body.length === 1 && r.body[0].subject === 'Math');

  r = await req('GET', '/errors?subject=Math,English');
  check('5b. Filter Math+English -> 2', Array.isArray(r.body) && r.body.length === 2);

  r = await req('GET', '/errors?subject=CS');
  check('5c. Filter CS -> 1', Array.isArray(r.body) && r.body.length === 1 && r.body[0].subject === 'CS');

  // ========== 6. Difficulty filter ==========
  r = await req('GET', '/errors?difficulty=5');
  check('6a. Filter difficulty=5 -> 1', Array.isArray(r.body) && r.body.length === 1 && r.body[0].difficulty === 5);

  r = await req('GET', '/errors?difficulty=4');
  check('6b. Filter difficulty=4 -> 1', Array.isArray(r.body) && r.body.length === 1 && r.body[0].difficulty === 4);

  r = await req('GET', '/errors?difficulty=2,5');
  check('6c. Filter difficulty=2,5 -> 2', Array.isArray(r.body) && r.body.length === 2);

  // ========== 7. Tag filter ==========
  r = await req('GET', '/errors?tag=formula');
  check('7a. Filter tag=formula -> 2', Array.isArray(r.body) && r.body.length === 2);

  r = await req('GET', '/errors?tag=vocab');
  check('7b. Filter tag=vocab -> 1', Array.isArray(r.body) && r.body.length === 1);

  r = await req('GET', '/errors?tag=philosophy');
  check('7c. Filter tag=philosophy -> 1', Array.isArray(r.body) && r.body.length === 1);

  // ========== 8. Search ==========
  r = await req('GET', '/errors?search=Integral');
  check('8a. Search Integral -> 1', Array.isArray(r.body) && r.body.length === 1);

  r = await req('GET', '/errors?search=contradiction');
  check('8b. Search contradiction -> 1', Array.isArray(r.body) && r.body.length === 1);

  r = await req('GET', '/errors?search=n%2B1');
  check('8c. Search n+1 -> 1', Array.isArray(r.body) && r.body.length === 1);

  r = await req('GET', '/errors?search=xyznotexist');
  check('8d. Search miss -> 0', Array.isArray(r.body) && r.body.length === 0);

  // ========== 9. Sort ==========
  r = await req('GET', '/errors?sortBy=difficulty&sortOrder=desc');
  check('9a. Sort difficulty desc -> first=5', Array.isArray(r.body) && r.body[0].difficulty === 5);

  r = await req('GET', '/errors?sortBy=difficulty&sortOrder=asc');
  check('9b. Sort difficulty asc -> first=2', Array.isArray(r.body) && r.body[0].difficulty === 2);

  r = await req('GET', '/errors?sortBy=review_count&sortOrder=asc');
  check('9c. Sort review_count asc', Array.isArray(r.body));

  r = await req('GET', '/errors?sortBy=created_at&sortOrder=desc');
  check('9d. Sort created_at desc', Array.isArray(r.body));

  // ========== 10. Combined filter ==========
  r = await req('GET', '/errors?subject=Math&difficulty=4&tag=calc');
  check('10.  Combined Math+4+calc -> 1', Array.isArray(r.body) && r.body.length === 1);

  // ========== 11. Update ==========
  r = await req('PUT', '/errors/' + ids[0], {
    subject: 'Math', difficulty: 5, question: '<p>Updated: Integral of x^2dx</p>',
    answer: '<p>x^3/3 + C</p>', tags: ['calc', 'formula', 'fixed'], source: '2024 Exam',
    review_count: 0, last_reviewed_at: null
  });
  check('11a. Update -> difficulty 4->5', r.body && r.body.difficulty === 5);
  check('11b. Update -> question changed', r.body && r.body.question.includes('Updated'));
  check('11c. Update -> tags count 3', r.body && r.body.tags && r.body.tags.length === 3);

  // ========== 12. Mark review ==========
  r = await req('POST', '/errors/' + ids[0] + '/review');
  check('12a. Review x1 -> count=1', r.body && r.body.review_count === 1);
  check('12b. Review x1 -> date set', r.body && r.body.last_reviewed_at != null);

  r = await req('POST', '/errors/' + ids[0] + '/review');
  check('12c. Review x2 -> count=2', r.body && r.body.review_count === 2);

  r = await req('POST', '/errors/' + ids[1] + '/review');
  check('12d. Review other -> count=1', r.body && r.body.review_count === 1);

  // ========== 13. Export ==========
  r = await req('GET', '/errors/export');
  check('13a. Export format JuYiDB/1', r.body && r.body._format === 'JuYiDB/1');
  check('13b. Export has array', r.body && Array.isArray(r.body.stores.errorNotebook));
  check('13c. Export 4 items', r.body && r.body.stores.errorNotebook.length === 4);
  check('13d. Export has timestamps', r.body && !!r.body.exportedAt);
  const exported = r.body;

  // ========== 14. Delete ==========
  r = await req('DELETE', '/errors/' + ids[2]);
  check('14a. Delete -> ok=true', r.body && r.body.ok);

  r = await req('GET', '/errors');
  check('14b. After delete -> 3 items', Array.isArray(r.body) && r.body.length === 3);

  // ========== 15. 404 ==========
  r = await req('GET', '/errors/' + ids[2]);
  check('15a. Deleted id -> 404', r.status === 404);
  r = await req('GET', '/errors/99999');
  check('15b. Bad id -> 404', r.status === 404);

  // ========== 16. Import restore ==========
  r = await req('POST', '/errors/import', exported);
  check('16a. Import -> ok', r.body && r.body.ok);
  check('16b. Import -> count=4', r.body && r.body.count === 4);

  r = await req('GET', '/errors');
  check('16c. Restored to 4', Array.isArray(r.body) && r.body.length === 4);

  // ========== 17. Static files (raw server, not /api) ==========
  const S = 'http://localhost:3000';
  for (const [label, url] of [
    ['17a. Home page', S + '/'],
    ['17b. Index HTML', S + '/index.html'],
    ['17c. Notebook HTML', S + '/modules/error-notebook/'],
    ['17d. Base CSS', S + '/shared/base.css'],
    ['17e. App JS', S + '/modules/error-notebook/app.js'],
    ['17f. Module CSS', S + '/modules/error-notebook/styles.css'],
  ]) {
    const res = await fetch(url);
    check(label + ' -> 200', res.status === 200);
  }

  // ========== 18. Edge cases ==========
  r = await req('POST', '/errors', { subject: 'Min', difficulty: 1, question: '', answer: '', tags: [], source: '' });
  check('18a. Minimal create -> 201', r.status === 201);

  r = await req('PUT', '/errors/99999', { subject: 'X', difficulty: 1, question: '', answer: '', tags: [], source: '', review_count: 0, last_reviewed_at: null });
  check('18b. Update bad id -> 404', r.status === 404);

  r = await req('POST', '/errors/import', { stores: { errorNotebook: [] } });
  check('18c. Import empty -> 400', r.status === 400);

  r = await req('POST', '/errors/import', { badformat: true });
  check('18d. Import bad format -> error', r.status !== 200);

  // ========== Summary ==========
  console.log('\n========================================');
  console.log('  PASS: ' + pass + '  |  FAIL: ' + fail);
  console.log('  Total: ' + (pass + fail));
  console.log('========================================');
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });