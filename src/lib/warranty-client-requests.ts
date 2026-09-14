import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { assertStorageCapacity } from '@/lib/billing/storage-usage';
import { clientRequestHash, validClientRequestId } from '@/lib/client-owner-requests';

export async function saveWarrantyRequest(admin: SupabaseClient, input: {
  accountId: string; jobId: string; warrantyId: string; requestId: string; description: string; files: File[];
}): Promise<{claimId: string | null; replayed: boolean; description: string; photoPaths: string[]}> {
  if (!validClientRequestId(input.requestId)) throw new Error('Refresh the form');
  const requestId=input.requestId.toLowerCase();
  const description=input.description.trim().slice(0,2000);
  if (!description) throw new Error('Describe the issue');
  const files=await Promise.all(input.files.slice(0,3).filter(f=>f.size>0 && f.size<=10*1024*1024 && /^(image\/(jpeg|png|webp|avif)|video\/(mp4|quicktime|webm))$/.test(f.type)).map(async file=>{
    const bytes=Buffer.from(await file.arrayBuffer());return {file,bytes,digest:createHash('sha256').update(bytes).digest('hex')};
  }));
  const hash=clientRequestHash(`warranty:${input.warrantyId}`,description,files.map(f=>JSON.stringify({name:f.file.name,type:f.file.type,digest:f.digest})));
  const prior=await admin.from('warranty_request_receipts').select('payload_hash,claim_id')
    .eq('account_id',input.accountId).eq('job_id',input.jobId).eq('warranty_id',input.warrantyId).eq('request_id',requestId).maybeSingle();
  if(prior.error)throw new Error('Receipt unavailable');
  if(prior.data){
    if(prior.data.payload_hash!==hash)throw new Error('Request content changed');
    return {claimId:prior.data.claim_id as string|null,replayed:true,description,photoPaths:[]};
  }
  // Verify ownership before uploading; the transaction checks it again.
  const warranty=await admin.from('warranties').select('id').eq('account_id',input.accountId).eq('job_id',input.jobId).eq('id',input.warrantyId).maybeSingle();
  if(warranty.error||!warranty.data)throw new Error('Warranty unavailable');
  if(files.length)await assertStorageCapacity(admin,input.accountId,files.reduce((n,f)=>n+f.bytes.length,0));
  const photoPaths:string[]=[];
  for(const [index,item] of files.entries()){
    const ext=item.file.type.split('/')[1].replace('quicktime','mov');
    const path=`${input.accountId}/warranty-requests/${input.warrantyId}/${requestId}/${index}-${item.digest}.${ext}`;
    const result=await admin.storage.from('job-photos').upload(path,item.bytes,{contentType:item.file.type,cacheControl:'31536000',upsert:false});
    if(result.error && String((result.error as {statusCode?:string|number}).statusCode)!=='409')throw new Error('Upload failed');
    photoPaths.push(path);
  }
  const result=await admin.rpc('submit_warranty_request',{p_account_id:input.accountId,p_job_id:input.jobId,p_warranty_id:input.warrantyId,p_request_id:requestId,p_payload_hash:hash,p_description:description,p_photo_paths:photoPaths});
  if(result.error||!result.data||typeof result.data.replayed!=='boolean'||(result.data.claim_id!==null&&typeof result.data.claim_id!=='string'))throw new Error('Claim unavailable');
  return {claimId:result.data.claim_id,replayed:result.data.replayed,description,photoPaths};
}
