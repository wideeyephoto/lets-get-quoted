import { cronRoute } from '@/lib/cron-runs';
import { runWeatherMorningAlerts } from '@/lib/weather-morning-alert';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Runs every 15 minutes to evaluate local timezone clocks.
// Sweeps accounts currently at 6:45 AM local time, checking today's outdoor jobs
// against morning weather and alerting the contractor before trucks roll.
export const GET = cronRoute('weather-morning-alert', runWeatherMorningAlerts);
