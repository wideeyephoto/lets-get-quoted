export const measuredRoom = {
  schemaVersion: 1, units: 'inches', title: 'Measured room', floorShape: 'rectangle', ceilingHeightInches: 96,
  walls: [120, 144, 120, 144].map(lengthInches => ({ lengthInches, heightInches: 96 })),
  openings: [{ type: 'door', wallIndex: 0, widthInches: 36, heightInches: 80, offsetInches: 12 }], objects: [],
};
