import QuickFillButtons from './quick-fill-buttons';

type TimeSlotSelectProps = {
  id: string;
  name: string;
  defaultValue?: string;
};

const QUICK_TIME_SLOTS = [
  { label: '7:00 AM', value: '07:00' },
  { label: '8:00 AM', value: '08:00' },
  { label: '9:00 AM', value: '09:00' },
  { label: '12:00 PM', value: '12:00' },
  { label: '1:00 PM', value: '13:00' },
];

function formatTimeLabel(value: string): string {
  const [hourText, minute] = value.split(':');
  const hour = Number(hourText);
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${minute} ${period}`;
}

function buildTimeSlots() {
  const slots: Array<{ label: string; value: string }> = [];

  for (let minutes = 6 * 60; minutes <= 19 * 60; minutes += 15) {
    const hour = Math.floor(minutes / 60).toString().padStart(2, '0');
    const minute = (minutes % 60).toString().padStart(2, '0');
    const value = `${hour}:${minute}`;

    slots.push({ label: formatTimeLabel(value), value });
  }

  return slots;
}

export default function TimeSlotSelect({ id, name, defaultValue = '' }: TimeSlotSelectProps) {
  const timeSlots = buildTimeSlots();

  return (
    <>
      <select id={id} name={name} defaultValue={defaultValue}>
        <option value="">No set time</option>
        {timeSlots.map((slot) => (
          <option key={slot.value} value={slot.value}>
            {slot.label}
          </option>
        ))}
      </select>
      <QuickFillButtons label="Quick add:" targetId={id} values={QUICK_TIME_SLOTS} />
    </>
  );
}