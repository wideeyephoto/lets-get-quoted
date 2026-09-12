import os

file_path = 'src/app/admin/audit/page.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

bad = '''        <button className="btn primary" type="submit">Filter</button>
        {actor || action || searchParams.from || searchParams.to ? <Link className="btn secondary" href="/admin/audit">Clear</Link> : null}
      </form>'''

good = '''        <button className="btn primary" type="submit">Filter</button>
        {actor || action || searchParams.from || searchParams.to ? <Link className="btn secondary" href="/admin/audit">Clear</Link> : null}
        
        {actions.length > 0 && (
          <a
            className="btn secondary"
            href={`/admin/audit/export?actor=${encodeURIComponent(actor)}&action=${encodeURIComponent(action)}&from=${encodeURIComponent(searchParams.from ?? '')}&to=${encodeURIComponent(searchParams.to ?? '')}`}
            download
            style={{ marginLeft: 'auto' }}
          >
            Export CSV
          </a>
        )}
      </form>'''

if bad in content:
    content = content.replace(bad, good)
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Done export fix")
else:
    print("Could not find string")
