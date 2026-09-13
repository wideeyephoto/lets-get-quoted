const fs = require('fs');
let content = fs.readFileSync('src/lib/templates/HeroQuickForm.tsx', 'utf-8');

function swap(oldText, newText) {
  content = content.split(oldText).join(newText);
}

swap("'Enter a valid phone number first.'", "t.enterPhoneFirst");
swap("'Code queued — it should arrive shortly. Enter it below.'", "t.codeQueued");
swap("'Could not send the code.'", "t.couldNotSend");
swap('"Tell us what you need done."', "t.tellUsWhat");
swap("'Enter a valid phone number so we can text or call you with your quote.'", "t.enterPhoneForQuote");
swap("Please choose how  may follow up about your request.", "t.chooseFollowUp(site.company_name || 'we')");
swap("'Add the town or city where the work is so we can confirm we serve your area.'", "t.addCity");
swap("'Choose when you need the work done.'", "t.chooseWhen");
swap("'Verify your phone first — tap \"Text me a code\" and enter the code.'", "t.verifyPhoneFirst");
swap("'Enter a valid email address.'", "t.enterValidEmail");
swap("'That email address doesn’t look right — fix it or leave it blank.'", "t.fixEmail");
swap("'Unable to send your request.'", "t.unableToSend");
swap("\"We've received your request! Our team is already reviewing your details.\"", "t.receivedRequest");
swap("'That’s the whole journey, price and all — and because this is a preview, nothing was sent and no lead was created.'", "t.previewWholeJourney");
swap("'Sending...'", "t.sending");
swap("'Request a Free Quote'", "t.requestFreeQuote");
swap("'See My Free Estimate'", "t.seeFreeEstimate");
swap("'Get My Free Estimate'", "t.getFreeEstimate");
swap(">or call<", ">{t.orCall}<");
swap("— free quote<", "— {t.freeQuote}<");
swap(">Edit project details<", ">{t.editProject}<");
swap("'Estimate & Inspection Scope'", "t.estimateScope");
swap("'Your estimated range'", "t.estimatedRange");
swap(">On-Site Assessment Required:<", ">{t.onSiteReq}<");
swap(">Major scope detected — final pricing requires visual inspection of structural access and line runs.<", ">{t.majorScope}<");
swap("Baseline:  — ", "${t.baseline} — ");
swap("'Preview — nothing sent'", "t.previewNothingSent");
swap("'Request sent'", "t.requestSent");
swap("Based on ", "{t.basedOn}");
swap("Subject to visual site inspection.", "{t.subjectToInspection}");
swap("A rough estimate, not a final quote.", "{t.roughEstimate}");
swap("Note: Your location (", "{t.noteYourLocation} (");
swap(") is outside our standard primary service area. Our dispatcher will confirm coverage when following up.", ") {t.outsideStandardArea}");
swap("'What a real customer sees here — yours wasn\\'t sent.'", "t.whatRealCustomerSees");
swap("'We got your details.'", "t.weGotDetails");
swap("'We call or text you'", "t.weCallOrText");
swap("'We text you'", "t.weTextYou");
swap(">Book your job<", ">{t.bookYourJob}<");
swap(">Or a free in-person estimate — your call.<", ">{t.orFreeEstimate}<");
swap(">Pick an arrival window to book on-site<", ">{t.pickArrival}<");
swap(">Select an available arrival window • No card required<", ">{t.selectAvailable}<");
swap(">Call now to lock it in<", ">{t.callNow}<");
swap(">Your request goes directly to ", ">{t.requestGoesDirectly} ");
swap("— never sold to lead brokers or competitors.<", "— {t.neverSold}<");
swap(">Add a job photo (e.g. equipment, work area). Please do not include IDs or financial documents.<", ">{t.addJobPhoto}<");
swap("Add more photos (/)", "t.addMorePhotos(selectedPhotos.length, MAX_PHOTOS)");
swap("'?? Add job photos'", "t.addJobPhotos");
swap("Remove ", "t.removePhoto(photo.name)");
swap(">Heads up: ", ">{t.headsUp} ");
swap("— send your request and we\\'ll confirm when we reach out.<", "— {t.sendRequest}<");
swap(">By submitting, you agree to be contacted ", ">{t.bySubmitting} ");
swap("'by text or email'", "t.byTextOrEmail");
swap("'by phone, text, or email'", "t.byPhoneTextEmail");
swap(" about your request. Message &amp; data rates may apply. See our ", " {t.aboutRequest} ");
swap(">Privacy Policy<", ">{t.privacyPolicy}<");
swap(">Typically replies within ", ">{t.typicallyReplies} ");

const importStr = "import { HeroQuickFormTranslations } from './HeroQuickFormTranslations';\n";
if (!content.includes('HeroQuickFormTranslations')) {
  content = importStr + content;
}

const hookStr = "  const smartIntakeActive = wizardEnabled && !classicFallback;\n";
if (!content.includes('const t =')) {
  content = content.replace(hookStr, hookStr + "  const t = site.language === 'es' ? HeroQuickFormTranslations.es : HeroQuickFormTranslations.en;\n");
}

fs.writeFileSync('src/lib/templates/HeroQuickForm.tsx', content, 'utf-8');
console.log('Done!');
