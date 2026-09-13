const fs = require('fs');
let content = fs.readFileSync('src/lib/templates/HeroQuickForm.tsx', 'utf-8');

const reps = [
  ["'Enter a valid phone number first.'", "t.enterPhoneFirst"],
  ["'Code queued — it should arrive shortly. Enter it below.'", "t.codeQueued"],
  ["'Could not send the code.'", "t.couldNotSend"],
  ['"Tell us what you need done."', "t.tellUsWhat"],
  ["'Enter a valid phone number so we can text or call you with your quote.'", "t.enterPhoneForQuote"],
  ["`Please choose how ${site.company_name || 'we'} may follow up about your request.`", "t.chooseFollowUp(site.company_name || 'we')"],
  ["'Add the town or city where the work is so we can confirm we serve your area.'", "t.addCity"],
  ["'Choose when you need the work done.'", "t.chooseWhen"],
  ["'Verify your phone first — tap \"Text me a code\" and enter the code.'", "t.verifyPhoneFirst"],
  ["'Enter a valid email address.'", "t.enterValidEmail"],
  ["'That email address doesn’t look right — fix it or leave it blank.'", "t.fixEmail"],
  ["'Unable to send your request.'", "t.unableToSend"],
  ['"|We\\'ve received your request! Our team is already reviewing your details."|'.replace(/\|/g, ''), "t.receivedRequest"],
  ["'That’s the whole journey, price and all — and because this is a preview, nothing was sent and no lead was created.'", "t.previewWholeJourney"],
  ["'Sending...'", "t.sending"],
  ["'Request a Free Quote'", "t.requestFreeQuote"],
  ["'See My Free Estimate'", "t.seeFreeEstimate"],
  ["'Get My Free Estimate'", "t.getFreeEstimate"],
  [">or call<", ">{t.orCall}<"],
  ["— free quote<", "— {t.freeQuote}<"],
  [">Edit project details<", ">{t.editProject}<"],
  ["'Estimate & Inspection Scope'", "t.estimateScope"],
  ["'Your estimated range'", "t.estimatedRange"],
  [">On-Site Assessment Required:<", ">{t.onSiteReq}<("],
  [">Major scope detected — final pricing requires visual inspection of structural access and line runs.<", ">{t.majorScope}<("],
  ["`Baseline: ${formatCurrency(estimate.min)} — ${formatCurrency(estimate.max)}`", "`${t.baseline}${formatCurrency(estimate.min)} — ${formatCurrency(estimate.max)}`"],
  ["'Preview — nothing sent'", "t.previewNothingSent"],
  ["'Request sent'", "t.requestSent"],
  ["Based on ", "{t.basedOn}"],
  ["Subject to visual site inspection.", "{t.subjectToInspection}"],
  ["A rough estimate, not a final quote.", "{t.roughEstimate}"],
  ["Note: Your location (", "{t.noteYourLocation} ("],
  [") is outside our standard primary service area. Our dispatcher will confirm coverage when following up.", ") {t.outsideStandardArea}"],
  ['"|What a real customer sees here — yours wasn\'t sent."|'.replace(/\|/g, ''), "t.whatRealCustomerSees"],
  ["'We got your details.'", "t.weGotDetails"],
  ["'We call or text you'", "t.weCallOrText"],
  ["'We text you'", "t.weTextYou"],
  [">Book your job<", ">{t.bookYourJob}<("],
  [">Or a free in-person estimate — your call.<", ">{t.orFreeEstimate}<("],
  [">Pick an arrival window to book on-site<", ">{t.pickArrival}<"],
  [">Select an available arrival window • No card required<", ">{t.selectAvailable}<"],
  [">Call now to lock it in<", ">{t.callNow}<"],
  [">Your request goes directly to ", ">{t.requestGoesDirectly} "],
  ["— never sold to lead brokers or competitors.<", "— {t.neverSold}<("],
  [">Add a job photo (e.g. equipment, work area). Please do not include IDs or financial documents.<", ">{t.addJobPhoto}<("],
  ["`Add more photos (${selectedPhotos.length}/${MAX_PHOTOS})`", "t.addMorePhotos(selectedPhotos.length, MAX_PHOTOS)"],
  ["'💎 Add job photos'", "t.addJobPhotos"],
  ["`Remove ${photo.name}`", "t.removePhoto(photo.name)"],
  [">Heads up: ", ">{t.headsUz} "],
  ["— send your request and we'll confirm when we reach out.<", "— {t.sendRequest}<("],
  [">By submitting, you agree to be contacted ", ">{t.bySubmitting} "],
  ["'by text or email'", "t.byTextOrEmail"],
  ["'by phone, text, or email'", "t.byPhoneTextEmail"],
  [" about your request. Message &amp; data rates may apply. See our ", " {t.aboutRequest} "],
  [">Privacy Policy<", ">{t.privacyPolicy}<"],
  [">Typically replies within ", ">{t.typicallyReplies} "],
];

for (const [oldStr, newStr] of reps) {
  content = content.split(oldStr).join(newStr);
}

const importStr = "import { HeroQuickFormTranslations } from './HeroQuickFormTranslations';\n";
if (!content.includes('HeroQuickFormTranslations')) {
  content = importStr + content;
}

const hookStr = "  const smartIntakeActive = wizardEnabled && !classicFallback;\n";
if (!content.includes('const t =')) {
  content = content.replace(hookStr, hookStr + "  const t = site.language === 'es' ? HeroQuickFormTranslations.es : HeroQuickFormTranslations.en;\n");
}

fs.writeFileSync('src/lib/templates/HeroQuickForm.tsx', content, 'utf-8');
