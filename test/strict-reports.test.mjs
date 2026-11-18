// Qualification must refuse partial, skipped, duplicated or changed evidence.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseStrictTap,aggregateStrict} from '../tools/strict-reports.mjs';
const tap='# tests 2\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';
const counts={tests:2,pass:2,fail:0,cancelled:0,skipped:0,todo:0};
const manifest=[{path:'test/a.test.mjs',sha256:'abc'},{path:'test/b.test.mjs',sha256:'def'}];
const records=()=>manifest.map(f=>({file:f.path,sourceSHA256:f.sha256,exitCode:0,complete:true,counts:{...counts}}));
test('complete all-passing file summaries aggregate every declared file',()=>{
 assert.deepEqual(parseStrictTap(tap,0),counts);
 assert.deepEqual(aggregateStrict(manifest,records()),{...counts,tests:4,pass:4});
});
test('a partial or duplicate summary and nonzero process exit are refused',()=>{
 assert.throws(()=>parseStrictTap('ok 1 - partial\n',0),/summary/);
 assert.throws(()=>parseStrictTap(tap+tap,0),/summary/);
 assert.throws(()=>parseStrictTap(tap,1),/process exit/);
});
test('failure, cancellation, skip, todo and inconsistent totals cannot qualify',()=>{
 for(const field of ['fail','cancelled','skipped','todo'])assert.throws(()=>parseStrictTap(tap.replace('# '+field+' 0','# '+field+' 1'),0));
 assert.throws(()=>parseStrictTap(tap.replace('# pass 2','# pass 1'),0),/must pass/);
});
test('missing, duplicate and changed file receipts cannot qualify',()=>{
 assert.throws(()=>aggregateStrict(manifest,records().slice(0,1)),/missing/);
 assert.throws(()=>aggregateStrict(manifest,[records()[0],records()[0]]),/duplicate/);
 const changed=records();changed[1].sourceSHA256='different';assert.throws(()=>aggregateStrict(manifest,changed),/changed/);
});
test('an incomplete or failed file cannot hide behind a passing aggregate',()=>{
 const partial=records();partial[0].complete=false;assert.throws(()=>aggregateStrict(manifest,partial),/incomplete/);
 const failed=records();failed[0].exitCode=1;assert.throws(()=>aggregateStrict(manifest,failed),/exit/);
 assert.throws(()=>aggregateStrict([],[]),/empty/);
});
