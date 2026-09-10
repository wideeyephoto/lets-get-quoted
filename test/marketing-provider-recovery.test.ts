import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { createPrintfulOrder } from '@/lib/merchandise/printful-client';
import { activateMetaCampaign, fetchMetaCampaignDailySpend, pauseMetaCampaign } from '@/lib/meta-ads-api';

const card: any = { orderNumber: 'FIXTURE-CARD', companyName: 'Example Plumbing', retailTotal: 47, shippingRateId: 'GROUND',
  shippingAddress: { fullName: 'Example',streetAddress:'100 Main St',city:'Austin',state:'TX',postalCode:'78701',country:'US',email:'test@example.com',phone:'5125550100' },
  items: [{productId:'biz_cards',quantity:100,unitPrice:0.35,totalPrice:35,customizationDetails:{businessName:'Example',customArtworkUrl:'https://example.com/front.png',backDesign:'https://example.com/back.png',finish:'uncoated'}}] };
beforeEach(() => { vi.stubEnv('NODE_ENV','production'); vi.stubEnv('PRINTFUL_API_KEY','fixture-provider-token'); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe('Provider reconciliation', () => {
  it('uses catalog-resolved pack IDs, two approved sides, confirmed creation and the quoted shipping service', async () => {
    const requests: any[]=[];
    vi.spyOn(globalThis,'fetch').mockImplementation(async (url, init) => {
      const path=String(url); requests.push({path,init});
      if(path.includes('/products/724')) return Response.json({result:{product:{title:'Set of Business Cards'},variants:[{id:51001,size:'50 pieces'},{id:51002,size:'100 pieces'}]}});
      if(path.includes('/orders/@')) return Response.json({code:404},{status:404});
      if(path.includes('/orders?confirm=true')) return Response.json({result:{id:9876,status:'pending'}});
      throw new Error(`Unexpected request ${path}`);
    });
    const result=await createPrintfulOrder(card); expect(result.ok).toBe(true); expect(result.isSimulated).toBe(false);
    const body=JSON.parse(requests.find(r=>r.path.includes('?confirm=true')).init.body);
    expect(body.shipping).toBe('GROUND'); expect(body.items[0]).toMatchObject({variant_id:51002,quantity:1}); expect(body.items[0].files).toHaveLength(2);
  });
  it('recovers an accepted external order without submitting another print run', async () => {
    const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async url => {
      if(String(url).includes('/products/724')) return Response.json({result:{product:{title:'Set of Business Cards'},variants:[{id:51002,size:'100 pieces'}]}});
      return Response.json({result:{id:9876,status:'inprocess'}});
    });
    expect((await createPrintfulOrder(card)).printfulOrderId).toBe(9876);
    expect(fetch.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(0);
  });
  it('refuses provider lookup failures rather than risking a duplicate order', async () => {
    vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json({error:'unavailable'},{status:503}));
    expect((await createPrintfulOrder(card)).ok).toBe(false);
  });
  it('leaves the parent paused when an ad set fails activation', async () => {
    const calls: any[]=[];
    vi.spyOn(globalThis,'fetch').mockImplementation(async (url,init) => { const body=JSON.parse(String(init?.body)); calls.push([String(url).split('/').pop(),body.status]); return Response.json(String(url).endsWith('/456')?{success:false,error:{message:'Rejected'}}:{success:true}); });
    const result=await activateMetaCampaign({campaignId:'123',adSetId:'456',adId:'789'},{accessToken:'fixture'});
    expect(result.success).toBe(false); expect(calls).toEqual([['789','ACTIVE'],['456','ACTIVE'],['123','PAUSED']]);
  });
  it('rejects false-success lifecycle replies and invalid provider spend', async () => {
    vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(Response.json({success:false})).mockResolvedValueOnce(Response.json({data:[{spend:'not-a-number'}]}));
    expect((await pauseMetaCampaign('123',{accessToken:'fixture'})).success).toBe(false);
    expect((await fetchMetaCampaignDailySpend('123',{accessToken:'fixture'})).success).toBe(false);
  });
});
