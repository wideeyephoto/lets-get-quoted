// Both names serve the same production project. Keep existing stored file URLs
// usable during the custom-domain rollout without trusting other Supabase tenants.
const productionHosts = ['api.letsgetquoted.com', 'mfuvvtrkipkigwqqtcal.supabase.co'];

export function supabaseHosts(value) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return productionHosts.includes(host) ? [...productionHosts] : [host];
  } catch {
    return [];
  }
}
