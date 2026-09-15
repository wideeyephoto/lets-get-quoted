import { build } from 'esbuild';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, dirname, sep, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:http';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'artifacts/email-campaign-review');
await mkdir(output, { recursive: true });
// Synthetic preview identity and signing key. Never loads account data or a sender.
process.env.NEXT_PUBLIC_APP_URL = 'https://app.letsgetquoted.com';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'local-preview-only-not-a-live-key';
const bundle = await build({
  stdin: { contents: `
    export { CONTRACTOR_LIFECYCLE_STEPS } from '@/lib/contractor-lifecycle-content';
    export { PLATFORM_CAMPAIGN_TEMPLATES } from '@/lib/platform-campaign-templates';
    export { renderPlatformEmail, renderPlatformEmailText } from '@/emails/platform';
  `, resolveDir: root, loader: 'ts' },
  alias: { '@': resolve(root, 'src') }, bundle: true, platform: 'node', format: 'esm', write: false,
});
const moduleFile = resolve(output, 'render.mjs');
await writeFile(moduleFile, bundle.outputFiles[0].text);
const { CONTRACTOR_LIFECYCLE_STEPS, PLATFORM_CAMPAIGN_TEMPLATES, renderPlatformEmail, renderPlatformEmailText } = await import(pathToFileURL(moduleFile));
const recipient = { name: 'Morgan Taylor', email: 'morgan@example.com', businessName: 'Reliable Home Services', accountId: 'local-preview' };
const entries = [
  ...CONTRACTOR_LIFECYCLE_STEPS.map(step => ({ ...step, group: 'Onboarding', name: step.eyebrow, timing: `${step.minAgeDays}–${step.maxAgeDays} days`, ctaUrl: 'https://app.letsgetquoted.com' + step.ctaPath })),
  ...PLATFORM_CAMPAIGN_TEMPLATES.map(template => ({ ...template, group: 'Broadcasts', timing: 'Manual campaign' })),
];
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
for (const entry of entries) {
  await writeFile(resolve(output, entry.id + '.html'), renderPlatformEmail(entry, recipient));
  await writeFile(resolve(output, entry.id + '.txt'), renderPlatformEmailText(entry, recipient));
}
await writeFile(resolve(output, 'catalog.json'), JSON.stringify(entries, null, 2));
const data = JSON.stringify(entries.map(({ id, name, subject, preheader, group, timing }) => ({ id, name, subject, preheader, group, timing }))).replaceAll('<', '\\u003c');
await writeFile(resolve(output, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LGQ email campaign review</title><style>
*{box-sizing:border-box}body{margin:0;background:#07131d;color:#f5f0e7;font:15px Arial,sans-serif}header{padding:22px 28px;border-bottom:1px solid #263c49}h1{margin:0 0 8px;font-size:25px}header p{color:#a7bcc8;margin:0;line-height:1.6}.layout{display:grid;grid-template-columns:275px 1fr;min-height:calc(100vh - 112px)}aside{padding:18px;background:#0d1d29}aside h2{font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#ff8c4a;margin:22px 10px 10px}button{cursor:pointer;font:inherit}aside button{display:block;width:100%;text-align:left;background:none;color:#d1e2eb;border:1px solid transparent;padding:11px 10px;border-radius:7px;font-size:13px}aside button:hover,aside button[aria-pressed=true]{background:#152c3c;border-color:#ff6a24;color:#fff}main{padding:24px;min-width:0}.info{max-width:760px;margin:0 auto 20px}.info h2{font-size:20px;margin:0 0 8px}.info p{color:#a7bcc8;margin:8px 0;line-height:1.4}.controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:16px}.controls button,.controls a{background:#152c3c;color:#fff;border:1px solid #39505e;border-radius:6px;padding:9px 12px;text-decoration:none}.controls button[aria-pressed=true]{background:#ff6a24;color:#1c2230;border-color:#ff6a24}iframe{display:block;width:100%;max-width:760px;height:1400px;margin:auto;border:0;background:#07131d}iframe.mobile{max-width:375px}@media(max-width:750px){.layout{grid-template-columns:1fr}aside{max-height:250px;overflow:auto}main{padding:16px 0}.info{padding:0 18px}}
</style></head><body><header><h1>Let’s Get Quoted · Email review</h1><p>23 revised templates · Synthetic sample business · Local preview only. Preview links do not send emails.</p></header><div class="layout"><aside aria-label="Email templates">${['Onboarding','Broadcasts'].map(group=>`<h2>${group}</h2>${entries.filter(e=>e.group===group).map(e=>`<button type="button" data-id="${e.id}" aria-pressed="false">${escape(e.name)}</button>`).join('')}`).join('')}</aside><main><section class="info"><h2 id="subject"></h2><p id="preheader"></p><p id="timing"></p><div class="controls"><button id="desktop" aria-pressed="true">Desktop</button><button id="mobile" aria-pressed="false">Mobile · 375 px</button><a id="text" target="_blank">Plain text</a><a id="full" target="_blank">Open email</a></div></section><iframe title="Rendered email preview" id="email" sandbox="allow-same-origin"></iframe></main></div><script>
const entries=${data};const email=document.getElementById('email');
function select(id){const e=entries.find(e=>e.id===id);document.getElementById('subject').textContent=e.subject;document.getElementById('preheader').textContent=e.preheader;document.getElementById('timing').textContent=e.group+' · '+e.timing;email.src=e.id+'.html';document.getElementById('text').href=e.id+'.txt';document.getElementById('full').href=e.id+'.html';document.querySelectorAll('[data-id]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.id===id)));}
document.querySelectorAll('[data-id]').forEach(b=>b.addEventListener('click',()=>select(b.dataset.id)));for(const size of ['desktop','mobile'])document.getElementById(size).onclick=()=>{email.classList.toggle('mobile',size==='mobile');document.getElementById('desktop').setAttribute('aria-pressed',String(size==='desktop'));document.getElementById('mobile').setAttribute('aria-pressed',String(size==='mobile'));};select(entries[0].id);
</script></body></html>`);
console.log(`Generated ${entries.length} email previews: ${output}`);
if (process.argv.includes('--serve')) {
  createServer(async (request, response) => {
    try {
      const name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const file = resolve(output, '.' + (name === '/' ? '/index.html' : name));
      if (!file.startsWith(output + sep) || !['.html', '.txt', '.json'].includes(extname(file))) { response.writeHead(404).end(); return; }
      response.setHeader('Content-Type', extname(file) === '.html' ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8');
      response.end(await readFile(file));
    } catch { response.writeHead(404).end(); }
  }).listen(4187, '127.0.0.1', () => console.log('Review: http://127.0.0.1:4187'));
}
