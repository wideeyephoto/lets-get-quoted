import { readFile, writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import pg from 'pg';

// Fill one account's review_invites so /dashboard/reviews can be LOOKED AT.
//
// The screen is four metric cards, a five-row rating breakdown and a private
// feedback list (src/app/dashboard/reviews/ReviewsScreen.tsx), and every one of
// them collapses to an empty state at zero rows. So the rows here are not
// "twenty reviews" — they are chosen to put something in every branch of
// summariseReviewInvites (src/lib/review-routing.ts:153):
//
//   · a response rate that is not 100%   — three asks nobody answered
//   · a non-zero count on all five bars  — including 1★ and 2★, the is-low fill
//   · googleCount, privateCount AND      — bothCount is impossible under the old
//     bothCount all non-zero               review gate; it is the point of its removal
//   · private feedback worth reading     — a colour substitution, a no-show
//                                          window, leaves left in the tree line
//
// Blandly positive feedback would show the layout and hide the product: the
// low-star cards are the ones an owner actually has to act on, and they are what
// the list is for.
//
// NOTHING HERE SENDS. It talks to Postgres directly and never to a server
// action, so submitPrivateFeedback's owner-alert email and the job-feed write
// are not involved — see src/lib/reviews.ts:175. Every row hangs off a job that
// is already complete, and no client, job or account row is touched.
//
// ONE THING TO KNOW: countRecentPrivateFeedback (src/lib/reviews.ts:46) counts
// private feedback in the last 30 days for a dashboard nudge, so seeding this
// will also light that nudge up. That is the real behaviour, not a side effect.
//
// Removal is exact, not heuristic: every id written is recorded in a manifest
// next to this file and --undo deletes precisely those ids. The tokens are real
// randomBytes(18) hex, the same as createReviewInvite mints, so the seeded rows
// are indistinguishable from real ones in the UI — which is the whole point, and
// is why they cannot be recognised by a prefix later.
//
// Run:
//   node scripts/seed-reviews.mjs --account <uuid>            (dry run: a plan, no writes)
//   node scripts/seed-reviews.mjs --account <uuid> --rehearse (writes, reports, rolls back)
//   node scripts/seed-reviews.mjs --account <uuid> --apply
//   node scripts/seed-reviews.mjs --account <uuid> --undo

// ---------------------------------------------------------------------------
// Environment + arguments
// ---------------------------------------------------------------------------

async function loadEnv() {
  const contents = await readFile(new URL('../.env.local', import.meta.url), 'utf8');
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : (process.argv[index + 1] ?? true);
}

const ACCOUNT = arg('account');
const REHEARSE = process.argv.includes('--rehearse');
const APPLY = process.argv.includes('--apply') || REHEARSE;
const UNDO = process.argv.includes('--undo');

if (!ACCOUNT || typeof ACCOUNT !== 'string') {
  console.error('Usage: node scripts/seed-reviews.mjs --account <uuid> [--rehearse | --apply | --undo]');
  console.error('Without --apply this only reports. Never defaults to an account.');
  process.exit(1);
}

const MANIFEST = new URL(`./.seed-reviews-${ACCOUNT}.json`, import.meta.url);

// ---------------------------------------------------------------------------
// The twenty
//
// Order is newest ask first, and the list is walked against the account's most
// recently completed jobs in the same order — so the top of the feedback list is
// the most recent work, the way it would be in life.
//
//   rating   null = asked, never answered
//   google   they took the public route
//   feedback they told the owner privately (a row can be both)
// ---------------------------------------------------------------------------

const PLAN = [
  { rating: 5, google: true },
  { rating: 5, google: true },
  {
    rating: 5,
    google: true,
    feedback:
      'Left one on Google as well. Wanted you to hear this bit directly though: the crew asked before they took anything off the maples. The last company did not, and I lost half a tree over it. Whole side of the house gets light again.',
  },
  {
    rating: 5,
    feedback:
      'Nothing to fix, just a thank you. You came the morning after that storm week when everyone else was quoting three weeks out, and the beds have never looked this clean this early in the year.',
  },
  { rating: 5, google: true },
  { rating: 5 },
  { rating: 5, google: true },
  { rating: 5, google: true },
  {
    rating: 5,
    feedback:
      'First real downpour since you finished and the crawlspace stayed dry. That was the entire reason I called. Money well spent and I have already given your number to two neighbours on this street.',
  },
  { rating: 4, google: true },
  {
    rating: 4,
    feedback:
      'Bed looks great and the four-season thing is exactly what I wanted. One note for next time: a couple of the shrubs went in closer to the walk than the drawing showed, so I will be cutting them back off it every year. Not worth a call-back, just so you know.',
  },
  { rating: 4, google: true },
  { rating: 4 },
  {
    rating: 3,
    feedback:
      'The zones work now and the repair itself was quick. The scheduling was not. I took an afternoon off for the first window and got a text at 4:40 saying it would be Thursday instead. If that had come at nine I would not have lost the day.',
  },
  {
    rating: 3,
    google: true,
    feedback:
      'System is good and the controller app is easier than I expected. Three stars because the trenching left ruts right across the back lawn and nobody warned me that would happen, then it took two calls to get someone back to topdress them.',
  },
  {
    rating: 2,
    feedback:
      'The beds themselves were done well. The leaves were not hauled away though — they were blown into the tree line at the back of the property, which is the exact place I have been trying to stop them collecting. I would like someone to come and take them.',
  },
  {
    rating: 1,
    feedback:
      'The mulch is the wrong colour. I chose black at the quote and what is down is red-brown, across every bed on both sides of the house. Nobody rang to say it had been substituted, I found out by pulling into my own driveway. I want this put right before I pay the balance.',
  },
  {},
  {},
  {},
];

// ---------------------------------------------------------------------------
// Timing
//
// The ask goes out the day after the work, the way the automation sends it, and
// an answer lands one to three days later. Anchored on the job's own date rather
// than on today, so re-seeding on a different day does not reshuffle the list.
// ---------------------------------------------------------------------------

const HOURS = [9, 11, 14, 16, 18];
const stampFrom = (base, days, index) => {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(HOURS[index % HOURS.length], (index * 17) % 60, 0, 0);
  return d.toISOString();
};

// The invite snapshots its own public destination — that is what google_url is
// for (src/lib/reviews.ts:57). This account has no Place ID linked, so this is
// the listing-URL shape googleReviewUrl falls back to rather than an invented
// writereview deep link, which would 404 the moment anyone opened it.
const GOOGLE_URL = 'https://www.google.com/maps/search/?api=1&query=Lawn%20%26%20Order%20Landscapers';

// ---------------------------------------------------------------------------

await loadEnv();
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await db.connect();

try {
  if (UNDO) await undo();
  else await seed();
} finally {
  await db.end();
}

async function seed() {
  const { rows: existing } = await db.query('select count(*)::int as n from review_invites where account_id = $1', [ACCOUNT]);
  const { rows: jobs } = await db.query(
    `select id, ref, scope, client_name, scheduled_for
       from jobs
      where account_id = $1 and status = 'complete'
      order by scheduled_for desc nulls last
      limit $2`,
    [ACCOUNT, PLAN.length],
  );

  if (jobs.length < PLAN.length) {
    console.error(`Only ${jobs.length} completed jobs on this account; ${PLAN.length} are needed. Nothing written.`);
    process.exit(1);
  }

  const rows = PLAN.map((entry, index) => {
    const job = jobs[index];
    const base = job.scheduled_for ? new Date(job.scheduled_for) : new Date();
    const createdAt = stampFrom(base, 1, index);
    const answered = entry.rating != null || entry.google || entry.feedback;
    const respondedAt = answered ? stampFrom(base, 2 + (index % 3), index + 2) : null;
    return {
      jobId: job.id,
      ref: job.ref,
      clientName: job.client_name,
      rating: entry.rating ?? null,
      feedback: entry.feedback ?? null,
      // routed_to is the legacy single-route field. Written to match what the
      // app writes today: submitPrivateFeedback stamps 'private', and the public
      // route no longer sets it at all.
      routedTo: entry.feedback ? 'private' : null,
      googleUrl: GOOGLE_URL,
      googleClickedAt: entry.google ? respondedAt : null,
      feedbackAt: entry.feedback ? respondedAt : null,
      createdAt,
      respondedAt,
    };
  });

  const rated = rows.filter((r) => r.rating != null);
  const stars = [1, 2, 3, 4, 5].map((n) => `${n}★ ${rated.filter((r) => r.rating === n).length}`).join('  ');
  const google = rows.filter((r) => r.googleClickedAt).length;
  const priv = rows.filter((r) => r.feedbackAt).length;
  const both = rows.filter((r) => r.googleClickedAt && r.feedbackAt).length;
  const responded = rows.filter((r) => r.respondedAt).length;

  console.log(`Account ${ACCOUNT}`);
  console.log(`  existing review_invites: ${existing[0].n}`);
  console.log(`  to write:                ${rows.length}`);
  console.log(`  ${stars}   avg ${(rated.reduce((sum, r) => sum + r.rating, 0) / rated.length).toFixed(1)}`);
  console.log(`  went to Google ${google} · private ${priv} · both ${both} · responded ${responded}/${rows.length} (${Math.round((responded / rows.length) * 100)}%)`);
  console.log('');
  for (const row of rows) {
    const route = [row.googleClickedAt ? 'google' : null, row.feedbackAt ? 'private' : null].filter(Boolean).join('+') || (row.rating ? 'rated only' : 'no answer');
    console.log(`  ${row.ref.padEnd(11)} ${String(row.rating ?? '—').padEnd(2)}★ ${route.padEnd(14)} ${row.clientName}`);
  }

  if (!APPLY) {
    console.log('\nDry run. Nothing written. Add --apply (or --rehearse) to write.');
    return;
  }

  await db.query('begin');
  try {
    const ids = [];
    for (const row of rows) {
      const { rows: written } = await db.query(
        `insert into review_invites
           (account_id, job_id, token, client_name, google_url, rating, feedback, routed_to,
            created_at, responded_at, google_clicked_at, feedback_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`,
        [ACCOUNT, row.jobId, randomBytes(18).toString('hex'), row.clientName, row.googleUrl, row.rating,
          row.feedback, row.routedTo, row.createdAt, row.respondedAt, row.googleClickedAt, row.feedbackAt],
      );
      ids.push(written[0].id);
    }

    const { rows: after } = await db.query(
      `select count(*)::int as n, round(avg(rating), 2) as avg, count(google_clicked_at)::int as google,
              count(feedback_at)::int as private
         from review_invites where account_id = $1`,
      [ACCOUNT],
    );
    console.log(`\nIn the table now: ${after[0].n} invites, avg ${after[0].avg}, ${after[0].google} google, ${after[0].private} private.`);

    if (REHEARSE) {
      await db.query('rollback');
      console.log('Rehearsal — rolled back. Nothing kept.');
      return;
    }

    await db.query('commit');
    await writeFile(MANIFEST, JSON.stringify({ account: ACCOUNT, ids }, null, 2));
    console.log(`Committed. Manifest: ${fileURLToPath(MANIFEST)}`);
    console.log('Undo with: node scripts/seed-reviews.mjs --account ' + ACCOUNT + ' --undo');
  } catch (error) {
    await db.query('rollback');
    throw error;
  }
}

async function undo() {
  let manifest = null;
  try {
    manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
  } catch {
    manifest = null;
  }
  if (!manifest?.ids?.length) {
    console.error(`No manifest at ${fileURLToPath(MANIFEST)}. Nothing removed — this script will not guess which rows were seeded.`);
    process.exit(1);
  }

  // account_id in the predicate as well as the id list: a manifest carried to
  // the wrong account deletes nothing rather than something.
  const { rowCount } = await db.query('delete from review_invites where account_id = $1 and id = any($2::uuid[])', [ACCOUNT, manifest.ids]);
  console.log(`Removed ${rowCount} review_invites.`);
  await unlink(MANIFEST).catch(() => {});
}
