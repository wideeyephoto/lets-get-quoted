import { describe,it,expect,vi,beforeEach,afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { POST } from '@/app/api/webhooks/printful/route';
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/auth',()=>({createAdminClient:()=>({rpc})}));
vi.mock('@/lib/rate-limit',()=>({checkRateLimit:vi.fn().mockResolvedValue(true),clientIpFrom:()=> '127.0.0.1'}));
describe('Printer callback durability',()=>{
  beforeEach(()=>{rpc.mockReset(); vi.stubEnv('PRINTFUL_STORE_ID','');});
  afterEach(()=>vi.unstubAllEnvs());
  it('retries the same event after a failed write and never claims a customer refund',async()=>{
    vi.stubEnv('PRINTFUL_WEBHOOK_SECRET','fixture-printer-hook');
    rpc.mockResolvedValueOnce({data:null,error:{message:'Database unavailable'}}).mockResolvedValue({data:true,error:null});
    const request=()=>new Request('https://example.com/api/webhooks/printful',{method:'POST',headers:{'x-pf-webhook-key':'fixture-printer-hook'},body:JSON.stringify({event_id:'fixture-retry-refund',type:'order_refunded',data:{order:{id:123,external_id:'FIXTURE'}}})});
    try {
      expect((await POST(request())).status).toBe(500);
      expect((await POST(request())).status).toBe(200);
      expect((await POST(request())).status).toBe(200);
      expect(rpc).toHaveBeenCalledTimes(2);
      expect(rpc.mock.calls[1][1].p_updates).toEqual({status:'cancelled',fulfillment_status:'cancelled'});
    } finally {vi.unstubAllEnvs();}
  });

  it('verifies a v2 hex key and persists each shipment once across retries',async()=>{
    const secret='ab'.repeat(64);
    vi.stubEnv('PRINTFUL_WEBHOOK_SECRET',secret);
    vi.stubEnv('PRINTFUL_STORE_ID','18734603');
    rpc.mockResolvedValue({data:true,error:null});
    const request=(shipmentId:number,retries=0)=>{
      const body=JSON.stringify({type:'shipment_sent',occurred_at:'2026-09-10T12:00:00Z',retries,store_id:18734603,
        data:{order:{id:456,external_id:'V2-FIXTURE'},shipment:{id:shipmentId,tracking_number:`TRACK-${shipmentId}`}}});
      const signature=createHmac('sha256',Buffer.from(secret,'hex')).update(body).digest('hex');
      return new Request('https://example.com/api/webhooks/printful',{method:'POST',headers:{'x-pf-webhook-signature':signature},body});
    };
    expect((await POST(request(1))).status).toBe(200);
    expect((await POST(request(1,1))).status).toBe(200);
    expect((await POST(request(2))).status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1][1]).toMatchObject({p_external_id:'V2-FIXTURE',p_provider_id:456,
      p_updates:{status:'shipped',fulfillment_status:'shipped',tracking_number:'TRACK-2'}});
  });

  it('rejects tampered signatures and signed events from another store',async()=>{
    const secret='cd'.repeat(64);
    vi.stubEnv('PRINTFUL_WEBHOOK_SECRET',secret);
    vi.stubEnv('PRINTFUL_STORE_ID','18734603');
    const body=JSON.stringify({type:'order_updated',store_id:999,data:{order:{id:789,status:'fulfilled'}}});
    const signature=createHmac('sha256',Buffer.from(secret,'hex')).update(body).digest('hex');
    const request=(payload:string)=>new Request('https://example.com/api/webhooks/printful',{
      method:'POST',headers:{'x-pf-webhook-signature':signature},body:payload});
    expect((await POST(request(body+' '))).status).toBe(401);
    expect((await POST(request(body))).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
});
