import 'server-only';
import { lookup } from 'node:dns/promises';
import { isIP, type LookupFunction } from 'node:net';
import { connect, checkServerIdentity } from 'node:tls';
import { isPrivateIp } from '@/lib/public-api/ssrf-guard';

// Validate the addresses used by the socket, preventing DNS rebinding between
// validation and connection. Never connect to private/metadata hosts.
const publicLookup: LookupFunction = (hostname, options, callback) => {
  void lookup(hostname, { all: true }).then((addresses) => {
    if (!addresses.length || addresses.some(({ address }) => isPrivateIp(address)
      || (isIP(address) === 6 && !/^[23][0-9a-f]{0,3}:/i.test(address)))) {
      callback(new Error('Domain resolves to a restricted address.'), '');
    } else if (options.all) {
      callback(null, addresses);
    } else {
      callback(null, addresses[0].address, addresses[0].family);
    }
  }).catch((error: Error) => callback(error, ''));
};

/** No HTTP request or redirects: prove a trusted certificate covers this SNI. */
export async function checkDomainTls(domain: string): Promise<boolean> {
  if (isIP(domain) || !domain.includes('.') || /[\s/:@]/.test(domain)) return false;
  return new Promise((resolve) => {
    const socket = connect({
      host: domain,
      port: 443,
      servername: domain,
      rejectUnauthorized: true,
      checkServerIdentity,
      lookup: publicLookup,
    });
    const finish = (ready: boolean) => {
      clearTimeout(timer);
      socket.destroy();
      resolve(ready);
    };
    const timer = setTimeout(() => finish(false), 8000);
    socket.once('secureConnect', () => finish(socket.authorized));
    socket.once('error', () => finish(false));
    socket.once('close', () => finish(false));
  });
}
