# Room scans and takeoffs

LiDAR Studio now starts empty when a job or lead has no scan. Scope text never selects a sample room. Importing Apple RoomPlan CapturedRoom JSON or an LGQ normalized scan saves one room against the current job or lead; importing another replaces it. A job uses its own scan first, then its linked lead's scan when it has none. The next **Draft this quote** operation loads those measurements from the database. Importing does not modify an existing quote.

## Deployment

Apply `migrations/20260905163943_room_spatial_scans.sql` before deploying this change. It adds nullable `room_spatial_scan` JSONB columns to the existing jobs and leads tables and retains their existing ownership policies. No live database changes or deployment were performed as part of the code fix.

The owner-only `/api/room-scans?kind=job|lead&id=<uuid>` endpoint reads and replaces scans through the session client, with account and soft-deletion filters in addition to RLS. Both file import and the server validate geometry. Failed loads show a retry state; failed saves retain the previous scan and do not report success.

## Apple RoomPlan import

Choose a `.json` file produced by `JSONEncoder().encode(capturedRoom)` in an Apple RoomPlan capture app. LiDAR Studio automatically recognizes the native surface dimensions and transforms, converts them to the canonical format below, validates the result, and saves it. No manual conversion step is needed. The same adapter runs for raw JSON sent directly to the API. Both v1 and v2 exports are accepted; an omitted version is accepted when the required native geometry is present. Unknown versions are rejected.

The adapter supports one closed room with straight, upright, rectangular walls, a flat ceiling, and wall bases on one floor. It orders unordered walls by matching their transformed endpoints, including reversed wall directions and concave room boundaries. Endpoint matching allows at most 1 mm of numerical disagreement. This is a topology consistency tolerance, not a claim of device accuracy; larger gaps, ambiguous junctions, internal partitions, disconnected boundaries, curved or sloped surfaces, multiple stories, and multi-room structures are rejected.

- Native dimensions are meters and matrices are column-major. A wall's endpoints are its world center plus/minus its local X basis times half its width. The adapter converts meters with `inches = meters / 0.0254` and establishes floor elevation from the wall bases.
- Floor `polygonCorners`, when present, are transformed from local plane coordinates and checked against the wall perimeter. Their local Y coordinate is not a world height. Individual surfaces already carry world transforms; `referenceOriginTransform` is not applied a second time.
- Doors, windows, and passages are attached using `parentIdentifier` plus geometric checks. Older exports without a parent identifier must match exactly one wall geometrically. Width, height, offset, and sill elevation are retained. Overlapping opening rectangles are rejected to prevent duplicate deductions.
- Object dimensions map from native `[width, height, depth]`. The native bounding-box center becomes a footprint center and base elevation; yaw is retained in the preview. Native categories and element IDs survive saving/reloading. Unsupported fixture labels remain `other` with the original category, rather than being guessed as plumbing fixtures.
- Apple's `low`, `medium`, and `high` confidence labels remain source metadata on surfaces/objects. They are never converted into accuracy percentages or point counts. Capture time and device model are not invented when absent.

The adapter follows Apple's [CapturedRoom](https://developer.apple.com/documentation/roomplan/capturedroom), [surface transform](https://developer.apple.com/documentation/roomplan/capturedroom/surface/transform), [local polygon corners](https://developer.apple.com/documentation/roomplan/capturedroom/surface/polygoncorners), and [parent identifier](https://developer.apple.com/documentation/roomplan/capturedroom/surface/parentidentifier) contracts. The public compatibility fixture and its license are documented in `test/fixtures/roomplan/README.md`.

## LGQ normalized format

`public/docs/room-scan-format.json` is a downloadable format example, deliberately marked `isSample: true` so it cannot accidentally become job measurements. Replace its geometry with measured values and remove the sample flag before importing.

- `schemaVersion`: `1`; `units`: `inches`. The explicit `*Inches` legacy field names also work when those two fields are omitted. Other units and versions are rejected.
- `floorPolygon`: 3–128 ordered `{ x, z }` vertices in inches, without repeating the first vertex. Concave polygons are supported. Self-intersection, repeated vertices, and overlapping edges are rejected.
- Alternatively, explicitly declare `floorShape: "rectangle"` and provide four ordered walls with matching opposite lengths. Wall lengths alone do not establish a room's shape.
- `walls`: one per polygon edge, in the same order, each with positive `lengthInches` and `heightInches`. Lengths must agree with polygon edges within 0.1 inch. This tolerance is a consistency check, not a measurement accuracy claim.
- `ceilingHeightInches`: positive flat-ceiling height. If omitted, it is taken from the supplied wall heights. All wall heights must agree; sloped ceilings require a future surface adapter.
- `openings`: optional array of `type` (`door`, `window`, `opening`), zero-based `wallIndex`, `widthInches`, `heightInches`, and `offsetInches`. Optional `sillHeightInches` locates the bottom of an opening above the floor. Width/offset and sill plus height must fit the wall. Overlapping rectangles are rejected. If either sill is absent, overlapping horizontal spans are conservatively rejected because their vertical relationship is unknown.
- `objects`: optional supported fixtures with dimensions `{ width, depth, height }` in inches and `position: { x, y, z }` in the same coordinates as the floor. X/Z locate the footprint center; Y is elevation at the fixture base. Optional `rotationYRadians` gives the local X direction in the world X/Z plane, between minus pi and pi; omitted rotation remains axis-aligned. Categories include `furniture` and `other` as well as the supported fixtures. Optional `sourceCategory` and `sourceConfidence` preserve native labels.
- `title`, `roomType`, `device`, `scannedAt`, `pointCount`, and `confidenceScore` are optional source metadata. Missing metadata never gets a fabricated device, point count, or precision claim.
- Optional `sourceFormat: "apple-roomplan"` and `sourceVersion` preserve import provenance. Optional IDs and `sourceConfidence` labels are retained on walls/openings/objects.
- Maximum upload size: 1 MB. Sample models cannot be imported as measurements.

Floor area uses the polygon's area, walls use the supplied lengths and heights minus openings, and baseboard uses perimeter minus floor-level door/passage widths (legacy openings without a sill are treated as floor-level). The SVG displays these surfaces; it is not a raw point-cloud viewer. Openings are deducted in quantities but are not cut out of the preview walls. The tape selects actual floor/ceiling vertices and measures their 3D straight-line distance in inches, independent of projection, rotation, and zoom. Existing wet-wall tile calculations remain estimates based on a three-sided surround, not measured tile surfaces.

## Capture and format limits

This provides the native JSON import adapter, not an iOS capture app. Capture still happens in a RoomPlan app that exports CapturedRoom JSON. A USDZ model alone, Polycam exports, arbitrary meshes, raw point clouds, multiple rooms, and sloped/curved surfaces require separate support. Compare imported measurements with known physical dimensions before making accuracy claims.

## Verification

Run the roomplan-adapter, room-scan validation, API, quote-context, LiDAR viewer, room-spatial-intel, property-intel, and quote-draft tests with Vitest, plus `npm run typecheck`. Regression coverage includes absent/sample scans, invalid dimensions and units, concave floors, opening deductions, owner/account boundaries, failed saves/loads, and saved geometry reaching the draft prompt. Native import coverage includes a public CapturedRoom v2 export, independently constructed rooms with known dimensions, transformed/reversed/concave boundaries, sill deductions, fixture yaw, source metadata round trips, rejected native geometry, raw API import, and RoomPlan measurements reaching the quote prompt.

The local browser check used the actual viewer with a synthetic persistence endpoint: invalid import, valid save, reload, job switching, 2D/3D controls, vertex distance through rotation/zoom, mobile overflow, and Escape dismissal. The RoomPlan follow-up also verified native import, retention after an invalid replacement, reloading, rotated furniture in 2D/3D, and a 390 px mobile viewport without horizontal overflow or browser errors. The API/store tests separately exercise the production handlers. The migration was executed twice in local PGlite, with round-trip and object/size constraint checks. A production device capture and hosted database flow still require deployment and a real scan.
