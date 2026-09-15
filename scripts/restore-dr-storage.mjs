#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { assertScratchTarget } from './lib/dr-target.mjs';
import { readEnv, decryptArtifact, sha256 } from './lib/dr-capture.mjs';
const option=n=>process.argv.find(a=>a.startsWith(`--${n}=`))?.slice(n.length+3);
async function main(){
  const root=resolve(import.meta.dirname,'..'), directory=resolve(option('capture')||'');
  const config=await readEnv(resolve(root,option('env')||'.env.staging.local'));
  const expected=option('project');
  if(!option('capture')||!/^[a-z]{20}$/.test(expected||''))throw Error('Explicit capture and project required');
  assertScratchTarget(config.DATABASE_URL,(await readEnv(resolve(root,'.env.local'))).DATABASE_URL,expected);
  if(new URL(config.NEXT_PUBLIC_SUPABASE_URL).hostname!==expected+'.supabase.co')throw Error('API project mismatch');
  const apply=process.argv.includes('--apply');
  if(apply&&option('confirm-destroy')!==expected)throw Error('Exact target acknowledgement required');
  const capture=JSON.parse(await readFile(resolve(directory,'capture-report.json'),'utf8'));
  if(!capture.captureVerified||capture.projectRef===expected)throw Error('Verified different-project source required');
  const key=(await readEnv(resolve(root,'.env.dr-backup.local'))).DR_BACKUP_KEY_HEX;
  const manifest=JSON.parse((await decryptArtifact(directory,capture.storageManifest,key)).toString());
  const client=createClient(config.NEXT_PUBLIC_SUPABASE_URL,config.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const report={startedAt:new Date().toISOString(),targetProject:expected,sourceProject:capture.projectRef,apply,objects:[],completed:false};
  try{
    for(const item of manifest){
      const bytes=await decryptArtifact(directory,item.artifact,key);
      if(!apply)continue;
      const bucket=client.storage.from(item.bucket_id);
      const upload=await bucket.upload(item.name,bytes,{upsert:true,contentType:item.metadata?.mimetype||'application/octet-stream',cacheControl:'3600'});
      if(upload.error)throw Error('Upload failed: '+upload.error.message);
      const link=await bucket.createSignedUrl(item.name,120);
      if(link.error||!link.data?.signedUrl)throw Error('Signed URL creation failed');
      const response=await fetch(link.data.signedUrl);
      const downloaded=Buffer.from(await response.arrayBuffer());
      if(!response.ok||sha256(downloaded)!==item.artifact.sha256)throw Error('Signed download hash mismatch');
      const privateBucket=!capture.buckets.find(b=>b.id===item.bucket_id)?.public;
      let publicAccessDenied;
      if(privateBucket){const url=bucket.getPublicUrl(item.name).data.publicUrl;const r=await fetch(url);publicAccessDenied=!r.ok;await r.body?.cancel();if(!publicAccessDenied)throw Error('Private object is publicly readable');}
      report.objects.push({bucket:item.bucket_id,pathSha256:sha256(item.name),bytes:bytes.length,sha256:item.artifact.sha256,signedDownloadVerified:true,privateBucket,publicAccessDenied});
      console.log(JSON.stringify({restored:report.objects.length,total:manifest.length,bucket:item.bucket_id}));
    }
    report.completed=apply&&report.objects.length===manifest.length;
  }finally{report.finishedAt=new Date().toISOString();await writeFile(resolve(root,'docs/runbooks/evidence/dr-restored-storage-2026-09-09.json'),JSON.stringify(report,null,2)+'\n');}
  console.log(JSON.stringify({completed:report.completed,objects:report.objects.length,bytes:report.objects.reduce((n,o)=>n+o.bytes,0)}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
