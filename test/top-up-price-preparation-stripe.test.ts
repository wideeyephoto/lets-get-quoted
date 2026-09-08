import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

// Run the real CLI with Stripe replaced at the Node module boundary. No API
// request can leave this child process, even if local environment files exist.
const stripeStub = `
const meta = {lgq_price_purpose:'top_up',lgq_top_up_id:'ai_voice_flex',lgq_resource_code:'voice_minutes',lgq_units:'100'};
let saved;
function price(query) {
  return {id:'price_existing',active:true,currency:'usd',unit_amount:6900,livemode:false,
    product:'prod_existing',tax_behavior:'exclusive',recurring:{interval:'month',interval_count:1},
    currency_options:{usd:{}},metadata:{...meta,lgq_catalog_version:query.match(/lgq_catalog_version'\\]:'([^']+)'/)[1]}};
}
export default class Stripe {
  prices = {
    search: async ({query}) => {
      if(process.env.PRICE_CASE==='missing') return {data:[],has_more:false};
      saved = price(query);
      if(process.env.PRICE_CASE==='wrong') saved.unit_amount=1;
      return {data:process.env.PRICE_CASE==='duplicate'?[saved,saved]:[saved],has_more:false};
    },
    create: async (args,options) => {
      if(!options.idempotencyKey) throw Error('missing idempotency');
      console.log('MOCK_PRICE_CREATED');
      saved={...args,id:'price_new',active:true,livemode:false,currency_options:{usd:{}}};
      return saved;
    },
    retrieve: async () => saved,
  };
  products = { create: async (args,options) => {
    if(!options.idempotencyKey) throw Error('missing idempotency');
    console.log('MOCK_PRODUCT_CREATED'); return {id:'prod_new'};
  }};
}
`;
const stubUrl = `data:text/javascript,${encodeURIComponent(stripeStub)}`;
const hook = `import {registerHooks} from 'node:module'; registerHooks({resolve(s,c,n){return s==='stripe'?{url:${JSON.stringify(stubUrl)},shortCircuit:true}:n(s,c)}});`;

function run(priceCase: string) {
  return spawnSync(process.execPath, [
    '--import', `data:text/javascript,${encodeURIComponent(hook)}`,
    'scripts/seed-stripe-top-up-prices.mjs', '--prepare-withheld=ai_voice_flex',
  ], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 10_000,
    env: { ...process.env, STRIPE_SECRET_KEY: 'sk_test_dummy', PRICE_CASE: priceCase },
  });
}

describe('withheld Price preparation against the Stripe boundary', () => {
  it('creates and verifies a missing monthly Price while retaining withholding', () => {
    const result = run('missing');
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('MOCK_PRICE_CREATED');
    expect(result.stdout).toContain('checkout and fulfillment remain withheld');
    expect(result.stdout).toContain('All seeded SKUs satisfy the contract');
  });
  it('reuses a matching Price without creating anything', () => {
    const result = run('matching');
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('reused');
    expect(result.stdout).not.toContain('MOCK_PRODUCT_CREATED');
  });
  it.each(['wrong', 'duplicate'])('refuses %s existing Prices without making another', (priceCase) => {
    const result = run(priceCase);
    expect(result.status).not.toBe(0);
    expect(result.stdout).not.toContain('MOCK_PRODUCT_CREATED');
    expect(result.stdout).not.toContain('All seeded SKUs satisfy');
  });
});
