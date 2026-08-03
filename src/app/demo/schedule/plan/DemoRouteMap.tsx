import { DEMO_ROUTE } from '@/lib/demo-data';

// A drawn stand-in for the route map, not a Google embed.
//
// The demo is logged out and public, so every visitor would be a billed Maps
// load for a map that can never move — and the API key is server-side, which a
// static page has no way to reach. Drawing it costs nothing, renders instantly,
// and cannot fail on a slow connection in front of a prospect.
//
// It is laid out to match the real stops rather than being decorative: Berkley
// top-left, both Ferndale stops south of it, Clawson out to the north-east, and
// the yard on Coolidge where the route actually starts.

type Pin = { x: number; y: number; n: number; label: string };

const YARD = { x: 96, y: 300 };

// Same order as DEMO_ROUTE.stops, so the numbers on the map and the numbers in
// the list beside it can never disagree.
const PINS: Pin[] = [
  { x: 188, y: 118, n: 1, label: 'Berkley' },
  { x: 268, y: 250, n: 2, label: 'Ferndale' },
  { x: 352, y: 296, n: 3, label: 'Supply' },
  { x: 520, y: 156, n: 4, label: 'Clawson' },
];

const ROUTE = [YARD, ...PINS.map(({ x, y }) => ({ x, y }))];
const path = ROUTE.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');

export default function DemoRouteMap() {
  return (
    <div className="plan-map-holder demo-map">
      <svg className="plan-map-canvas" viewBox="0 0 640 420" role="img" aria-label={`Sample route: ${PINS.length} stops around ${DEMO_ROUTE.startAddress}`} preserveAspectRatio="xMidYMid slice">
        <rect width="640" height="420" fill="#0d1b2a" />

        {/* Blocks first, so the roads draw over their edges the way they do on a
            real map rather than being outlined by them. */}
        <path d="M430 320 L640 300 L640 420 L400 420 Z" fill="rgba(58,110,160,.14)" />
        <path d="M60 40 L190 26 L215 96 L86 118 Z" fill="rgba(78,138,92,.13)" />
        <path d="M470 60 L590 44 L604 118 L486 132 Z" fill="rgba(78,138,92,.1)" />

        <g stroke="rgba(255,255,255,.055)" strokeWidth="9" strokeLinecap="round" fill="none">
          <path d="M-20 150 L660 108" /><path d="M-20 262 L660 226" /><path d="M-20 366 L660 336" />
          <path d="M120 -20 L146 440" /><path d="M300 -20 L322 440" /><path d="M470 -20 L492 440" />
        </g>
        <g stroke="rgba(255,255,255,.032)" strokeWidth="4" strokeLinecap="round" fill="none">
          <path d="M-20 76 L660 44" /><path d="M-20 206 L660 170" /><path d="M-20 312 L660 282" />
          <path d="M212 -20 L236 440" /><path d="M386 -20 L406 440" /><path d="M560 -20 L580 440" />
        </g>

        {/* The interstate — wider, warmer, with a centre line, because a map with
            one road weight reads as graph paper. */}
        <path d="M-20 400 C 150 372, 300 300, 400 190 S 560 40, 660 10" stroke="rgba(255,214,150,.13)" strokeWidth="13" fill="none" strokeLinecap="round" />
        <path d="M-20 400 C 150 372, 300 300, 400 190 S 560 40, 660 10" stroke="rgba(255,214,150,.16)" strokeWidth="1.4" fill="none" strokeDasharray="9 11" />

        {/* The route: a soft glow under a solid line, so it lifts off the roads
            instead of looking like one more of them. */}
        <path d={path} stroke="rgba(255,138,61,.28)" strokeWidth="11" fill="none" strokeLinejoin="round" strokeLinecap="round" />
        <path d={path} stroke="#ff8a3d" strokeWidth="3.4" fill="none" strokeLinejoin="round" strokeLinecap="round" />

        {/* The yard. Hollow, because it is where the day starts, not a stop. */}
        <circle cx={YARD.x} cy={YARD.y} r="8" fill="#0d1b2a" stroke="#ff8a3d" strokeWidth="2.5" />
        <text x={YARD.x} y={YARD.y + 26} textAnchor="middle" fill="rgba(255,255,255,.62)" fontSize="12" fontWeight="700">Yard</text>

        {PINS.map((pin) => (
          <g key={pin.n}>
            <circle cx={pin.x} cy={pin.y} r="15" fill="rgba(255,138,61,.22)" />
            <circle cx={pin.x} cy={pin.y} r="11.5" fill="#ff7a21" stroke="#0d1b2a" strokeWidth="2" />
            <text x={pin.x} y={pin.y + 4.4} textAnchor="middle" fill="#10202f" fontSize="12.5" fontWeight="900">{pin.n}</text>
            <text x={pin.x} y={pin.y + 30} textAnchor="middle" fill="rgba(255,255,255,.66)" fontSize="11.5" fontWeight="700">{pin.label}</text>
          </g>
        ))}
      </svg>

      {/* Said plainly rather than left to be discovered. The rest of the demo is
          fictional data in a real interface; this is the one thing that is a
          drawing of an interface, and pretending otherwise would be the only
          dishonest pixel on the site. */}
      <p className="demo-map-note">Sample route — the live app draws this on Google Maps</p>
    </div>
  );
}
