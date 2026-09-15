import { createAdminClient } from './supabase-admin';

export function createReadOnlyAdminClient() {
  const admin = createAdminClient();
  
  const roHandler: ProxyHandler<any> = {
    get(target, prop, receiver) {
      if (prop === 'insert' || prop === 'update' || prop === 'delete' || prop === 'upsert') {
        return () => {
          throw new Error('Action blocked: You are in Read-Only Impersonation Mode.');
        };
      }
      
      const value = Reflect.get(target, prop, receiver);
      if (typeof value === 'function') {
        return function (...args: any[]) {
          const result = value.apply(target, args);
          // If the result is an object (like PostgrestBuilder), proxy it too
          if (result && typeof result === 'object') {
            return new Proxy(result, roHandler);
          }
          return result;
        };
      }
      return value;
    }
  };

  return new Proxy(admin, roHandler);
}
