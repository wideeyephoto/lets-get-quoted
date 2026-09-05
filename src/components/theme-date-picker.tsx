'use client';

import { useId, useRef, useState, useEffect } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import FloatingPanel from '@/components/floating-panel';
import styles from './theme-date-picker.module.css';

export interface ThemeDatePickerProps {
  id?: string;
  name?: string;
  value?: string; // YYYY-MM-DD (controlled)
  defaultValue?: string; // YYYY-MM-DD (uncontrolled)
  onChange?: (value: string) => void;
  title?: string;
  disabled?: boolean;
  min?: string;
  max?: string;
  className?: string;
  allowClear?: boolean;
  ariaLabel?: string;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEKDAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export function dateToKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function keyToDate(key: string): Date | null {
  if (!key) return null;
  const parts = key.split('-').map(Number);
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

export function formatDisplayDate(key: string): string {
  if (!key) return 'MM/DD/YYYY';
  const parts = key.split('-');
  if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
    return `${parts[1]}/${parts[2]}/${parts[0]}`;
  }
  return key;
}

export interface CalendarCell {
  day: number;
  dateKey: string;
  isAdjacent: boolean;
  monthDelta: number; // -1 for prev month, 0 for current, 1 for next
}

export function buildCalendarCells(visibleMonth: Date): CalendarCell[] {
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();

  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay(); // 0 = Sunday
  const daysInCurrentMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const cells: CalendarCell[] = [];

  // Trailing days from previous month
  const prevMonthDate = new Date(year, month - 1, 1);
  const prevYear = prevMonthDate.getFullYear();
  const prevMonthNum = prevMonthDate.getMonth();
  for (let i = startWeekday - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i;
    const dateKey = dateToKey(new Date(prevYear, prevMonthNum, day));
    cells.push({ day, dateKey, isAdjacent: true, monthDelta: -1 });
  }

  // Days in current month
  for (let day = 1; day <= daysInCurrentMonth; day++) {
    const dateKey = dateToKey(new Date(year, month, day));
    cells.push({ day, dateKey, isAdjacent: false, monthDelta: 0 });
  }

  // Leading days from next month to complete 42 cells (6 rows of 7)
  const nextMonthDate = new Date(year, month + 1, 1);
  const nextYear = nextMonthDate.getFullYear();
  const nextMonthNum = nextMonthDate.getMonth();
  let nextDay = 1;
  while (cells.length < 42) {
    const dateKey = dateToKey(new Date(nextYear, nextMonthNum, nextDay));
    cells.push({ day: nextDay, dateKey, isAdjacent: true, monthDelta: 1 });
    nextDay++;
  }

  return cells;
}

export default function ThemeDatePicker({
  id,
  name,
  value,
  defaultValue = '',
  onChange,
  title,
  disabled = false,
  min,
  max,
  className,
  allowClear = true,
  ariaLabel = 'Date picker',
}: ThemeDatePickerProps) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const effectiveValue = value !== undefined ? value : internalValue;

  const [isOpen, setIsOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState<Date>(() => keyToDate(effectiveValue) ?? new Date());
  const generatedId = useId();
  const calendarId = id ? `${id}-calendar-panel` : generatedId;
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Sync visible month when value externally changes and calendar is opened
  useEffect(() => {
    if (effectiveValue) {
      const parsed = keyToDate(effectiveValue);
      if (parsed) setVisibleMonth(parsed);
    }
  }, [effectiveValue]);

  const todayKey = dateToKey(new Date());
  const currentYear = new Date().getFullYear();
  const visibleYear = visibleMonth.getFullYear();
  const visibleMonthIndex = visibleMonth.getMonth();

  // Range of years for dropdown: past 12 years to future 8 years
  const startYear = Math.min(currentYear - 12, visibleYear - 2);
  const endYear = Math.max(currentYear + 8, visibleYear + 2);
  const yearOptions: number[] = [];
  for (let y = startYear; y <= endYear; y++) {
    yearOptions.push(y);
  }

  function handlePrevMonth() {
    setVisibleMonth(new Date(visibleYear, visibleMonthIndex - 1, 1));
  }

  function handleNextMonth() {
    setVisibleMonth(new Date(visibleYear, visibleMonthIndex + 1, 1));
  }

  function handleMonthSelect(newMonthIndex: number) {
    setVisibleMonth(new Date(visibleYear, newMonthIndex, 1));
  }

  function handleYearSelect(newYear: number) {
    setVisibleMonth(new Date(newYear, visibleMonthIndex, 1));
  }

  function updateDate(newDate: string) {
    if (value === undefined) {
      setInternalValue(newDate);
    }
    onChange?.(newDate);
  }

  function handleDayClick(cell: CalendarCell) {
    if (min && cell.dateKey < min) return;
    if (max && cell.dateKey > max) return;

    updateDate(cell.dateKey);

    // If day was in adjacent month, update visible month too
    if (cell.monthDelta !== 0) {
      const targetDate = keyToDate(cell.dateKey);
      if (targetDate) setVisibleMonth(targetDate);
    }

    setIsOpen(false);
  }

  function handleTodayClick() {
    const today = dateToKey(new Date());
    updateDate(today);
    setVisibleMonth(new Date());
    setIsOpen(false);
  }

  function handleClearClick() {
    updateDate('');
    setIsOpen(false);
  }

  const cells = buildCalendarCells(visibleMonth);

  return (
    <div className={`${styles.pickerContainer} ${className || ''}`}>
      {name && <input type="hidden" name={name} id={id} value={effectiveValue} />}
      <button
        ref={buttonRef}
        type="button"
        id={id && !name ? id : undefined}
        className={styles.triggerBtn}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen ? calendarId : undefined}
        aria-label={ariaLabel}
        title={title}
        disabled={disabled}
      >
        <span>{formatDisplayDate(effectiveValue)}</span>
        <CalendarIcon size={13} className={styles.triggerIcon} />
      </button>

      <FloatingPanel
        id={calendarId}
        role="dialog"
        label="Calendar date picker"
        anchorRef={buttonRef}
        open={isOpen}
        onClose={() => setIsOpen(false)}
        className={styles.calendarPanel}
        width={304}
      >
        <div className={styles.calendarHeader}>
          <button
            type="button"
            className={styles.navBtn}
            onClick={handlePrevMonth}
            aria-label="Previous month"
            title="Previous month"
          >
            <ChevronLeft size={16} />
          </button>

          <div className={styles.headerControls}>
            <select
              className={styles.selectMonth}
              value={visibleMonthIndex}
              onChange={(e) => handleMonthSelect(Number(e.target.value))}
              aria-label="Select month"
            >
              {MONTH_NAMES.map((month, idx) => (
                <option key={month} value={idx}>
                  {month}
                </option>
              ))}
            </select>

            <select
              className={styles.selectYear}
              value={visibleYear}
              onChange={(e) => handleYearSelect(Number(e.target.value))}
              aria-label="Select year"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className={styles.navBtn}
            onClick={handleNextMonth}
            aria-label="Next month"
            title="Next month"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className={styles.weekdaysRow} aria-hidden="true">
          {WEEKDAY_NAMES.map((day) => (
            <span key={day} className={styles.weekdayLabel}>
              {day}
            </span>
          ))}
        </div>

        <div className={styles.daysGrid} role="grid" aria-label="Calendar days">
          {cells.map((cell) => {
            const isSelected = cell.dateKey === effectiveValue;
            const isToday = cell.dateKey === todayKey;
            const isDisabled = Boolean((min && cell.dateKey < min) || (max && cell.dateKey > max));

            let cellClass = styles.dayBtn;
            if (cell.isAdjacent) cellClass += ` ${styles.dayAdjacent}`;
            if (isToday) cellClass += ` ${styles.dayToday}`;
            if (isSelected) cellClass += ` ${styles.daySelected}`;

            return (
              <button
                key={cell.dateKey}
                type="button"
                className={cellClass}
                disabled={isDisabled}
                onClick={() => handleDayClick(cell)}
                aria-label={`${cell.dateKey}${isSelected ? ', selected' : ''}${isToday ? ', today' : ''}`}
                aria-selected={isSelected}
              >
                {cell.day}
              </button>
            );
          })}
        </div>

        <div className={styles.calendarFooter}>
          {allowClear ? (
            <button
              type="button"
              className={styles.clearBtn}
              onClick={handleClearClick}
              title="Clear selected date"
            >
              Clear
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            className={styles.todayBtn}
            onClick={handleTodayClick}
            title="Select today's date"
          >
            Today
          </button>
        </div>
      </FloatingPanel>
    </div>
  );
}
