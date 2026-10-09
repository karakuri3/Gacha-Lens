import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const src = fs.readFileSync('.github/workflows/cloudflare-production-release-proof.yml', 'utf8');
const begin = src.indexOf('          parse_home_headers() {');
const end = src.indexOf('          request_get() {', begin);
assert.ok(begin >= 0 && end > begin, 'actual workflow must include parser and evidence functions');
const funcs = src.slice(begin, end).split('\n').map(s => s.startsWith('          ') ? s.slice(10) : s).join('\n');
const awkProgram = funcs.match(/\bawk '([\s\S]*?)' "\$1"/)?.[1];
assert.ok(awkProgram, 'extract real production awk implementation');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gacha-proof-'));
process.on('exit', () => fs.rmSync(temp, {recursive:true, force:true}));
function parse(lines, eol='\n') {
  const input = path.join(temp, 'fixture.headers');
  fs.writeFileSync(input, lines.join(eol) + eol);
  const p = spawnSync('awk', [awkProgram, input], {encoding:'utf8'});
  assert.equal(p.status,0,p.stderr);
  return Object.fromEntries(p.stdout.trim().split('\n').map(s=>s.split('=')));
}
const home = ['HTTP/2 200','Content-Type: text/html; charset=utf-8','strict-transport-security: max-age=63072000'];

test('lowercase, uppercase and mixed-case exact names',()=>{
  for(const name of ['x-gacha-edge-cache-policy','X-GACHA-EDGE-CACHE-POLICY','X-Gacha-Edge-Cache-Policy']) {
    assert.equal(parse([...home, name+': public-document-120-v1']).marker_validation,'valid');
  }
});
test('LF, CRLF and spacing',()=>{
  for(const eol of ['\n','\r\n']) for (const sep of [':', ': ', ':\t', ':  \t']) {
    const res=parse([...home,'X-Gacha-Edge-Cache-Policy'+sep+'public-document-120-v1 \t'],eol);
    assert.equal(res.marker_validation,'valid');
    assert.equal(res.hsts,'present');
    assert.equal(res.content_type_family,'html');
  }
});
test('missing, empty, wrong field name and unexpected marker all fail',()=>{
  assert.deepEqual([parse(home).marker_presence,parse(home).marker_validation],['absent','missing']);
  for(const value of ['', '  \t']) assert.equal(parse([...home,'X-Gacha-Edge-Cache-Policy: '+value]).marker_validation,'empty');
  for(const value of ['other','PUBLIC-DOCUMENT-120-V1','public-document-120-v1, public-document-120-v1']) {
    assert.equal(parse([...home,'X-Gacha-Edge-Cache-Policy: '+value]).marker_validation,'unexpected');
  }
  assert.equal(parse([...home,'X-Gacha-Edge-Cache-Policy-Bad: public-document-120-v1']).marker_validation,'missing');
});
test('duplicate and conflicting headers fail including case variants',()=>{
  const key='x-gacha-edge-cache-policy: public-document-120-v1';
  assert.equal(parse([...home,key,'X-Gacha-Edge-Cache-Policy: public-document-120-v1']).marker_validation,'duplicate');
  assert.equal(parse([...home,key,'X-Gacha-Edge-Cache-Policy: invalid']).marker_validation,'conflicting');
});
test('only last curl redirect response header block is recognized',()=>{
  const res=parse(['HTTP/2 302','x-gacha-edge-cache-policy: public-document-120-v1','Strict-Transport-Security: present','','HTTP/2 200','Content-Type: text/html']);
  assert.equal(res.marker_validation,'missing');
  assert.equal(res.hsts,'absent');
});
test('HTTP 200 alone is insufficient; HSTS, source-SHA, no-store and marker required',()=>{
  assert.equal(parse(home).marker_validation,'missing');
  for (const check of [
    /grep -Fxq 'marker_validation=valid' "\$tmp\/home\.evidence" \|\| \{/,
    /grep -Fxq 'hsts=present' "\$tmp\/home\.evidence" \|\| \{/,
    /if \[\[ "\$rc" == '0' && "\$code" == '200' \]\]; then break; fi/,
    /\[\[ "\$deployed_sha" == "\$TARGET_SHA" \]\] \|\| \{/,
    /\[\[ "\$cache_control" == \*'no-store'\* \]\] \|\| \{/,
  ]) assert.match(src,check);
});
test('sanitized PASS and FAIL evidence never prints secrets or raw body',()=>{
  const summary=path.join(temp,'summary');
  for(const [value, expected] of [['public-document-120-v1','valid'],['SECRET_MARKER','unexpected']]) {
    fs.writeFileSync(summary,'');
    fs.writeFileSync(path.join(temp,'home.headers'), ['HTTP/2 200', 'X-Gacha-Edge-Cache-Policy: '+value,'Content-Type: SECRET_TYPE','Set-Cookie: SECRET_COOKIE','Authorization: Bearer SECRET_AUTH','Strict-Transport-Security: required'].join('\r\n'));
    fs.writeFileSync(path.join(temp,'home.body'),'SECRET_BODY 商品情報を取得できません');
    const run=spawnSync('bash',['-e','-c',funcs+'\ntmp="$EVIDENCE_TMP"\nhome_http_status=200\nhome_evidence_written=false\nemit_home_evidence'],{
      encoding:'utf8',env:{...process.env,EVIDENCE_TMP:temp,GITHUB_STEP_SUMMARY:summary,TARGET_SHA:'a'.repeat(40)}
    });
    assert.equal(run.status,0,run.stderr);
    const output=run.stdout+'\n'+fs.readFileSync(summary,'utf8');
    for(const secret of ['SECRET_MARKER','SECRET_COOKIE','SECRET_AUTH','SECRET_TYPE','SECRET_BODY']) assert.ok(!output.includes(secret),'leaked '+secret);
    assert.ok(output.includes('marker_validation='+expected));
    assert.ok(output.includes('http_status=200'));
    assert.ok(output.includes('html_error_marker=present'));
    assert.ok(output.includes('set_cookie=present'));
    assert.ok(output.includes('content_type_family=other'));
  }
});
test('standing workflow trigger/requests/retries and egress remain unchanged',()=>{
  assert.match(src,/on:\n  push:\n    branches:\n      - main/);
  assert.doesNotMatch(src,/workflow_dispatch:|^\s+pull_request:/m);
  assert.doesNotMatch(src,/IGNORECASE=1/);
  assert.match(src,/for attempt in \$\(seq 1 40\); do/);
  assert.match(src,/for attempt in \$\(seq 1 6\); do/);
  assert.match(src,/curl --silent --show-error --location --max-time 90/);
  assert.match(src,/"\$\{PRODUCTION_URL\}\$\{path\}"/);
  assert.match(src,/"\$\{PRODUCTION_URL\}\/api\/runtime-diagnostics\/release-source"/);
  assert.match(src,/request_get home '\/' 'Gacha Lens'/);
  assert.match(src,/request_get robots '\/robots\.txt'/);
  assert.match(src,/trap 'emit_home_evidence \|\| true; rm -rf "\$tmp"' EXIT/);
  assert.doesNotMatch(src,/head -c 1200 "\$body"/);
  assert.equal((src.match(/curl --(?:fail|silent)/g)||[]).length,3);
});
test('old mawk parser reproducibly misses mixed-case, new parser succeeds',{skip:!!spawnSync('mawk',['-W','version'],{encoding:'utf8'}).error},()=>{
  const old=spawnSync('mawk',['BEGIN{IGNORECASE=1} /^x-gacha-edge-cache-policy:/ {print $2}'],{encoding:'utf8',input:'X-Gacha-Edge-Cache-Policy: public-document-120-v1\n'});
  assert.equal(old.status,0);
  assert.equal(old.stdout.trim(),'');
  assert.equal(parse([...home,'X-Gacha-Edge-Cache-Policy: public-document-120-v1']).marker_validation,'valid');
});
