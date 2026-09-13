import re

with open("src/lib/clients.ts", "r", encoding="utf-8") as f:
    text = f.read()

# I want to replace everything from `let clients: Client[];` up to `return (clients ?? [])`
# but since the regex might be tricky, I'll use a safer script

search_block = r"""  let clients: Client\[\];[\s\S]*?  return \(clients \?\? \[\]\)"""

replace_block = """  const todayKey = options?.todayKey ?? new Date().toISOString().slice(0, 10);

  let clients: Client[];
  let statsData: any[] = [];

  const fetchAll = options?.fetchAll ?? true;

  if (fetchAll) {
    const { fetchAllPages } = await import('@/lib/pagination');
    [clients, { data }] = await Promise.all([
      fetchAllPages<Client>((from, to) =>
        applyTestRecordFilter(supabase.from('clients').select('id, account_id, name, phone, email, address, notes, last_rebook_invite_at, created_at, updated_at').eq('account_id', accountId), options).range(from, to),
      ),
      supabase.rpc('get_client_stats', { p_account_id: accountId, p_today: todayKey })
    ]);
    statsData = data ?? [];
  } else {
    const [clientsRes, statsRes] = await Promise.all([
      applyTestRecordFilter(supabase.from('clients').select('id, account_id, name, phone, email, address, notes, last_rebook_invite_at, created_at, updated_at').eq('account_id', accountId), options),
      supabase.rpc('get_client_stats', { p_account_id: accountId, p_today: todayKey }),
    ]);
    clients = (clientsRes.data ?? []) as Client[];
    statsData = statsRes.data ?? [];
  }

  type Entry = Omit<ClientWithStats, keyof Client>;
  const blank = (): Entry => ({ jobCount: 0, totalValue: 0, lastJobAt: null, nextJobAt: null, lastVisitAt: null, unscheduledJobs: 0 });

  const stats = new Map<string, Entry>();
  for (const row of statsData) {
    stats.set(row.client_id, {
      jobCount: Number(row.job_count) || 0,
      totalValue: Number(row.total_value) || 0,
      lastJobAt: row.last_job_at,
      nextJobAt: row.next_job_at,
      lastVisitAt: row.last_visit_at,
      unscheduledJobs: Number(row.unscheduled_jobs) || 0,
    });
  }

  return (clients ?? [])"""

if re.search(search_block, text):
    text = re.sub(search_block, replace_block, text)
    with open("src/lib/clients.ts", "w", encoding="utf-8") as f:
        f.write(text)
    print("Replaced!")
else:
    print("Not found.")
