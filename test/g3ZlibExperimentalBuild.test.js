'use strict';
// Isolated experiment may NEVER broaden the canonical Dockerfile.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const experimental=()=>fs.readFileSync(path.join(root,'cloud-run/g3-review-staging/Dockerfile.zlib-experiment'),'utf8');
const original=()=>fs.readFileSync(path.join(root,'cloud-run/g3-review-staging/Dockerfile'),'utf8');
const allowed=[
 'ARG BASE_IMAGE','FROM $'+'{BASE_IMAGE}','WORKDIR /srv',
 'RUN --mount=type=bind,source=zlib-1.3.2-r1.apk,target=/tmp/zlib-1.3.2-r1.apk,readonly \\',
 'apk --no-network verify /tmp/zlib-1.3.2-r1.apk && \\',
 'apk --no-network --no-scripts --no-commit-hooks add /tmp/zlib-1.3.2-r1.apk && \\',
 'test "$(apk info -v zlib)" = "zlib-1.3.2-r1" && \\',
 'test -d /usr/local/lib/node_modules/npm && \\',
 'rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack && \\',
 'rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack',
 'COPY --chown=node:node index.mjs /srv/index.mjs','ENV NODE_ENV=production',
 'USER node','EXPOSE 8080','CMD ["node","/srv/index.mjs"]'
];
function allow(source){
 const lines=source.split(/\r?\n/).map(x=>x.trim())
   .filter(x=>x&&!x.startsWith('#'));
 return JSON.stringify(lines)===JSON.stringify(allowed);
}
test('experiment Dockerfile is precise, offline package install and nonroot',()=>{
 assert.equal(allow(experimental()),true);
 for(const extra of ['RUN apk upgrade','RUN curl https://example.invalid',
  'RUN apk --allow-untrusted add zlib','COPY . /srv','USER root','FROM node:latest'])
  assert.equal(allow(experimental()+'\n'+extra),false);
});
test('canonical canary stays SHA-only, unaffected by experimental patch',()=>{
 const s=original();
 assert.match(s,/ARG BASE_IMAGE/);
 assert.match(s,/FROM \$\{BASE_IMAGE\}/);
 assert.doesNotMatch(s,/zlib-1\.3\.2-r1\.apk|apk --no-network .*add/);
 assert.match(s,/USER node/);
 const lock=JSON.parse(fs.readFileSync(
  path.join(root,'cloud-run/g3-review-staging/base-image.candidate.json')));
 assert.equal(lock.reviewStatus,'UNREVIEWED');
 assert.equal(lock.releaseStatus,'NO_GO');
 assert.equal(lock.canDeploy,false);
});
