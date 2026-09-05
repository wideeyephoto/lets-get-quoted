# Room scans and takeoffs

LiDAR Studio now starts empty when a job or lead has no scan. Scope text never selects a sample room. Importing an LGQ normalized scan saves one room against the current job or lead; importing another replaces it. A job uses its own scan first, then its linked lead's scan when it has none. The next **Draft this quote** operation loads those measurements from the database. Importing does not modify an existing quote.

## Deployment

Apply `migrations/20260905163943_room_spatial_scans.sql` before deploying this change. It adds nullable `room_spatial_scan` JSONB columns to the existing jobs and leads tables and retains their existing ownership policies. No live database changes or deployment were performed as part of the code fix.

The owner-only `/api/room-scans?kind=job|lead&id=<uuid>` endpoint reads and replaces scans through the session client, with account and soft-deletion filters in addition to RLS. Both file import and the server validate geometry. Failed loads show a retry state; failed saves retain the previous scan and do not report success.

## Supported format

`public/docs/room-scan-format.json` is a downloadable format example, deliberately marked `isSample: true` so it cannot accidentally become job measurements. Replace its geometry with measured values and remove the sample flag before importing.

- `schemaVersion`: `1`; `units`: `inches`. The explicit `*Inches` legacy field names also work when those two fields are omitted. Other units and versions are rejected.
- `floorPolygon`: 3–128 ordered `{ x, z }` vertices in inches, without repeating the first vertex. Concave polygons are supported. Self-intersection, repeated vertices, and overlapping edges are rejected.
- Alternatively, explicitly declare `floorShape: "rectangle"` and provide four ordered walls with matching opposite lengths. Wall lengths alone do not establish a room's shape.
- `walls`: one per polygon edge, in the same order, each with positive `lengthInches` and `heightInches`. Lengths must agree with polygon edges within 0.1 inch. This tolerance is a consistency check, not a measurement accuracy claim.
- `ceilingHeightInches`: positive flat-ceiling height. If omitted, it is taken from the supplied wall heights. All wall heights must agree; sloped ceilings require a future surface adapter.
- `openings`: optional array of `type` (`door`, `window`, `opening`), zero-based `wallIndex`, `widthInches`, `heightInches`, and `offsetInches`. Width/offset and height must fit the wall. Overlapping horizontal spans are rejected because the format has no vertical opening placement.
- `objects`: optional supported fixtures with dimensions `{ width, depth, height }` in inches and `position: { x, y, z }` in the same coordinates as the floor. X/Z locate the footprint center; Y is elevation at the fixture base. Fixtures are axis-aligned bounding boxes.
- `title`, `roomType`, `device`, `scannedAt`, `pointCount`, and `confidenceScore` are optional source metadata. Missing metadata never gets a fabricated device, point count, or precision claim.
- Maximum upload size: 1 MB. Sample models cannot be imported as measurements.

Floor area uses the polygon's area, walls use the supplied lengths and heights minus openings, and baseboard uses perimeter minus door/passage widths. The SVG displays these surfaces; it is not a raw point-cloud viewer. Openings are deducted in quantities but are not cut out of the preview walls. The tape selects actual floor/ceiling vertices and measures their 3D straight-line distance in inches, independent of projection, rotation, and zoom. Existing wet-wall tile calculations remain estimates based on a three-sided surround, not measured tile surfaces.

## Native LiDAR capture still needed

This change does not provide an iOS capture app or accept native RoomPlan/Polycam/USDZ exports directly. The next implementation needs a real representative export from the chosen capture app and a tested adapter for its units, transforms, wall connectivity, openings, and fixture coordinates. Convert to the normalized format only when a closed room boundary can be established; reject incomplete scans rather than filling gaps with defaults. Preserve capture provenance and compare calculated dimensions with known physical measurements before making accuracy claims. Multiple rooms, sloped surfaces, arbitrary meshes, and raw point-cloud processing are separate additions.

## Verification

Run the room-scan validation, API, quote-context, LiDAR viewer, room-spatial-intel, property-intel, and quote-draft tests with Vitest, plus `npm run typecheck`. Regression coverage includes absent/sample scans, invalid dimensions and units, concave floors, opening deductions, owner/account boundaries, failed saves/loads, and saved geometry reaching the draft prompt.

The local browser check used the actual viewer with a synthetic persistence endpoint: invalid import, valid save, reload, job switching, 2D/3D controls, vertex distance through rotation/zoom, mobile overflow, and Escape dismissal. The API/store tests separately exercise the production handlers. The migration was executed twice in local PGlite, with round-trip and object/size constraint checks. A production device capture and hosted database flow still require deployment and a real scan.
