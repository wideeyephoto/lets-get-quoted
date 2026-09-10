import { describe,it,expect,vi } from 'vitest';
import { POST } from '@/app/api/webhooks/printful/route';
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/auth',()=>({createAdminClient:()=>({rpc})}));
vi.mock('@/lib/rate-limit',()=>({checkRateLimit:vi.fn().mockResolvedValue(true),clientIpFrom:()=> '127.0.0.1'}));
describe('Printer callback durability',()=>{
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
});
