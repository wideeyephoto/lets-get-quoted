// Native Node only: still works if dependency installation failed.
import { sendMonitorFailure } from '../src/lib/operational-monitor.mjs';
try { console.log(JSON.stringify({ fallbackNotificationId: await sendMonitorFailure() })); }
catch { console.error('Monitoring failure notification was not accepted.'); process.exitCode = 1; }
