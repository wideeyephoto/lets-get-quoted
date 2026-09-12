import re

with open("src/app/client/jobs/[token]/page.tsx", "r", encoding="utf-8") as f:
    text = f.read()

search_block = r"""  const dashboard = await getClientJobDashboard\(params\.token\);[\s\S]*?    \| null;"""

replace_block = """  const access = await resolveJobAccess(params.token);
  const admin = createAdminClient();

  const [
    dashboard,
    clientChangeOrders,
    { rawWarranties, clientWarranties },
    { data: siteRow },
    clientSelections,
    clientFormSubmissions,
    clientInsurance,
    wide,
  ] = await Promise.all([
    getClientJobDashboard(params.token),
    access ? loadClientChangeOrders(admin, access.accountId, access.jobId).then(toClientChangeOrders) : Promise.resolve([]),
    (async () => {
      if (!access) return { rawWarranties: [], clientWarranties: [] };
      const rawWarranties = await listWarranties(admin, access.accountId, access.jobId);
      const docUrlsMap: Record<string, Array<{ name: string; url: string }>> = {};
      if (rawWarranties.length > 0) {
        await Promise.all(
          rawWarranties.map(async (w) => {
            if (w.documentPaths && w.documentPaths.length > 0) {
              docUrlsMap[w.id] = await signedWarrantyDocUrls(admin, access.accountId, w.documentPaths);
            }
          })
        );
      }
      return { rawWarranties, clientWarranties: toClientWarranties(rawWarranties, undefined, docUrlsMap) };
    })(),
    access ? admin.from('sites').select('content').eq('account_id', access.accountId).maybeSingle() : Promise.resolve({ data: null }),
    access ? loadClientSelections(admin, access.accountId, access.jobId).then(r => toSignedClientSelections(admin, access.accountId, r)) : Promise.resolve([]),
    access ? listJobFormSubmissions(admin, access.accountId, access.jobId) : Promise.resolve([]),
    access ? clientInsuranceFor(admin, access.accountId) : Promise.resolve(null),
    access ? admin.from('jobs').select('quote_signer_name, quote_signed_at, quoted_amount, quote_signature_path, quote_signature_method').eq('account_id', access.accountId).eq('id', access.jobId).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);

  const siteContent = getSiteContent(siteRow?.content ?? null);
  const googleReviewDeepUrl = googleReviewUrl({
    placeId: siteContent.testimonials.googlePlaceId,
    listingUrl: siteContent.testimonials.googleUrl,
  });

  const signatureRow = (wide.error && access
    ? (await admin.from('jobs').select('quote_signer_name, quote_signed_at, quoted_amount').eq('account_id', access.accountId).eq('id', access.jobId).maybeSingle()).data
    : wide.data) as
    | {
        quote_signer_name?: string | null;
        quote_signed_at?: string | null;
        quoted_amount?: number | null;
        quote_signature_path?: string | null;
        quote_signature_method?: string | null;
      }
    | null;"""

if re.search(search_block, text):
    text = re.sub(search_block, replace_block, text)
    with open("src/app/client/jobs/[token]/page.tsx", "w", encoding="utf-8") as f:
        f.write(text)
    print("Replaced!")
else:
    print("Not found.")
