# RoomPlan compatibility fixture

`captured-room-v2.json` contains the geometry from the public `static/test-roomplan.json` export in [open3dfloorplan](https://raw.githubusercontent.com/thelodgebots/open3dfloorplan/92e7845be497e5724c6cd4836926cd6a015fe0bf/static/test-roomplan.json). Source revision: `92e7845be497e5724c6cd4836926cd6a015fe0bf`. Only the opaque `coreModel` payload was removed; the wall, opening, floor, object, confidence, and transform data are unchanged. The upstream MIT license is included in `LICENSE.txt`.

This is compatibility evidence for Apple's encoded CapturedRoom v2 shape, not a physical accuracy certification. Synthetic fixtures in the adapter tests independently establish known dimensions, rotations, and failure cases.
