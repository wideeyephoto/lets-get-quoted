/** The instant 7 AM falls on the work date in the account's IANA time zone. */
export function crewBriefingSendAt(dateKey: string, timeZone: string): Date {
  const day = new Date(`${dateKey}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !Number.isFinite(day.getTime())
      || day.toISOString().slice(0, 10) !== dateKey) {
    throw new Error('Choose a valid work date.');
  }
  const target = day.getTime() + 7 * 60 * 60 * 1000;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  let guess = target;
  // Recheck the offset at the resulting instant to cover daylight saving changes.
  for (let pass = 0; pass < 4; pass += 1) {
    const parts = formatter.formatToParts(new Date(guess));
    const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    const local = Date.UTC(value('year'), value('month') - 1, value('day'), value('hour'), value('minute'), value('second'));
    if (local === target) return new Date(guess);
    guess += target - local;
  }
  throw new Error('Unable to schedule 7 AM in this account time zone.');
}
