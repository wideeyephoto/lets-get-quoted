import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Crew Seat Entitlement and Capacity RPCs Canonical Schema Parity', () => {
  const schemaPath = join(process.cwd(), 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf8').replace(/\r\n/g, '\n');

  it('defines workspace_purchased_capacity_units in canonical schema', () => {
    expect(schema).toContain('create or replace function public.workspace_purchased_capacity_units');
    expect(schema).toContain("from public.workspace_purchased_capacity c");
    expect(schema).toContain("c.status in ('active', 'past_due')");
  });

  it('defines create_crew_member_with_seat_entitlement in canonical schema with office permissions and capacity limits', () => {
    expect(schema).toContain('create or replace function public.create_crew_member_with_seat_entitlement');
    expect(schema).toContain("public.office_can(p_account_id, 'crew.write')");
    expect(schema).toContain("public.workspace_purchased_capacity_units(p_account_id, 'crew_users')");
    expect(schema).toContain("'crew_seat_limit_reached'");
    expect(schema).toContain('grant execute on function public.create_crew_member_with_seat_entitlement');
  });

  it('defines reactivate_crew_member_with_seat_entitlement in canonical schema with office permissions and capacity limits', () => {
    expect(schema).toContain('create or replace function public.reactivate_crew_member_with_seat_entitlement');
    expect(schema).toContain("public.office_can(p_account_id, 'crew.write')");
    expect(schema).toContain("public.workspace_purchased_capacity_units(p_account_id, 'crew_users')");
    expect(schema).toContain('grant execute on function public.reactivate_crew_member_with_seat_entitlement');
  });
});
