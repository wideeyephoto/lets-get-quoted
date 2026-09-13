'use client';

import { useState, useTransition } from 'react';
import type { PropertyPassport } from '@/lib/property-passport';
import { updatePassportEquipmentAction, addPassportEquipmentAction } from './actions';

interface PassportEditorProps {
  passports: PropertyPassport[];
  token: string;
  businessName: string;
  brandPhone: string | null;
}

export function PassportEditor({ passports, token, businessName, brandPhone }: PassportEditorProps) {
  const [isPending, startTransition] = useTransition();
  const [editingEquipmentId, setEditingEquipmentId] = useState<string | null>(null);
  const [addingToPassportId, setAddingToPassportId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!passports || passports.length === 0) return null;

  async function handleUpdateEquipment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingEquipmentId) return;
    const formData = new FormData(e.currentTarget);
    const fields = {
      name: formData.get('name') as string,
      brand: formData.get('brand') as string,
      modelNumber: formData.get('modelNumber') as string,
      serialNumber: formData.get('serialNumber') as string,
      notes: formData.get('notes') as string,
    };
    setErrorMsg(null);
    startTransition(async () => {
      const res = await updatePassportEquipmentAction(token, editingEquipmentId, fields);
      if (res.ok) {
        setEditingEquipmentId(null);
      } else {
        setErrorMsg(res.message || 'Failed to update equipment');
      }
    });
  }

  async function handleAddEquipment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!addingToPassportId) return;
    const formData = new FormData(e.currentTarget);
    const fields = {
      name: formData.get('name') as string,
      category: formData.get('category') as string,
      brand: formData.get('brand') as string,
      modelNumber: formData.get('modelNumber') as string,
      serialNumber: formData.get('serialNumber') as string,
      notes: formData.get('notes') as string,
    };
    setErrorMsg(null);
    startTransition(async () => {
      const res = await addPassportEquipmentAction(token, addingToPassportId, fields);
      if (res.ok) {
        setAddingToPassportId(null);
      } else {
        setErrorMsg(res.message || 'Failed to add equipment');
      }
    });
  }

  return (
    <section className="panel workspace-section-card">
      <div className="section-heading workspace-section-heading compact-heading">
        <p className="eyebrow">Durable Home Passport</p>
        <h2>Mechanical systems &amp; property records</h2>
      </div>

      {passports.map((passport) => (
        <div key={passport.id} style={{ marginTop: '0.8rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem', padding: '0.75rem 1rem', background: 'var(--surface-subtle, #f8fafc)', borderRadius: '8px', border: '1px solid var(--edge-t12, #e2e8f0)', marginBottom: '0.85rem' }}>
            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Passport ID: {passport.passportCode}
              </span>
              <strong style={{ display: 'block', fontSize: '1rem', color: '#0f172a' }}>{passport.address}</strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Home Health:</span>
              <span style={{ padding: '0.2rem 0.55rem', borderRadius: '6px', background: passport.healthScore.score >= 80 ? '#ecfdf5' : '#fffbeb', color: passport.healthScore.score >= 80 ? '#065f46' : '#b45309', fontWeight: 800, fontSize: '0.85rem', border: '1px solid currentColor' }}>
                {passport.healthScore.grade} ({passport.healthScore.score}/100)
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem' }}>
            {passport.equipment.map((eq) => {
              const isEditing = editingEquipmentId === eq.id;
              if (isEditing) {
                return (
                  <form key={eq.id} onSubmit={handleUpdateEquipment} style={{ padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid var(--edge-t16, #cbd5e1)', background: 'var(--surface-color, #fff)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>Edit Equipment</div>
                    {errorMsg && <div style={{ color: 'red', fontSize: '0.8rem' }}>{errorMsg}</div>}
                    <input name="name" defaultValue={eq.name} required placeholder="Equipment Name" className="form-input" style={{ padding: '0.3rem', fontSize: '0.85rem' }} />
                    <input name="brand" defaultValue={eq.brand} placeholder="Brand" className="form-input" style={{ padding: '0.3rem', fontSize: '0.85rem' }} />
                    <input name="modelNumber" defaultValue={eq.modelNumber || ''} placeholder="Model Number" className="form-input" style={{ padding: '0.3rem', fontSize: '0.85rem' }} />
                    <input name="serialNumber" defaultValue={eq.serialNumber || ''} placeholder="Serial Number" className="form-input" style={{ padding: '0.3rem', fontSize: '0.85rem' }} />
                    <textarea name="notes" defaultValue={eq.notes || ''} placeholder="Notes" className="form-input" style={{ padding: '0.3rem', fontSize: '0.85rem' }} />
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                      <button type="submit" className="btn primary" disabled={isPending} style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}>Save</button>
                      <button type="button" onClick={() => setEditingEquipmentId(null)} className="btn secondary" disabled={isPending} style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}>Cancel</button>
                    </div>
                  </form>
                );
              }
              return (
                <div key={eq.id} style={{ padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid var(--edge-t16, #cbd5e1)', background: 'var(--surface-color, #fff)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '0.4rem' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.4rem', marginBottom: '0.2rem' }}>
                      <strong style={{ fontSize: '0.92rem', color: '#0f172a' }}>{eq.name}</strong>
                      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.35rem', borderRadius: '4px', background: '#f1f5f9', color: '#475569', fontWeight: 600 }}>
                          {eq.condition}
                        </span>
                        <button type="button" onClick={() => setEditingEquipmentId(eq.id)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }} aria-label="Edit">
                          ✏️
                        </button>
                      </div>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', lineHeight: 1.4 }}>
                      {eq.brand ? <div>Brand: <strong>{eq.brand}</strong></div> : null}
                      {eq.modelNumber ? <div>Model: {eq.modelNumber}</div> : null}
                      {eq.serialNumber ? <div>Serial: {eq.serialNumber}</div> : null}
                      {eq.notes ? <div>Notes: {eq.notes}</div> : null}
                      {eq.specs?.filterSize ? (
                        <div style={{ color: '#0369a1', fontWeight: 600, marginTop: '0.2rem' }}>
                          🔍 Filter Spec: {eq.specs.filterSize as string}
                        </div>
                      ) : null}
                      <div style={{ marginTop: '0.2rem', fontSize: '0.75rem' }}>
                        Installed {eq.installedOn} (approx. {eq.estimatedAgeYears} yrs old)
                      </div>
                    </div>
                  </div>

                  {brandPhone ? (
                    <div style={{ marginTop: '0.4rem', paddingTop: '0.4rem', borderTop: '1px solid #f1f5f9' }}>
                      <a
                        href={`sms:${brandPhone.replace(/[^0-9+]/g, '')}?&body=${encodeURIComponent(`Hi ${businessName}, I would like to schedule service/filter replacement for my ${eq.name} at ${passport.address}.`)}`}
                        className="btn secondary"
                        style={{ fontSize: '0.75rem', padding: '0.25rem 0.55rem', width: '100%', textAlign: 'center' }}
                      >
                        🔧 Request Unit Service
                      </a>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {addingToPassportId === passport.id ? (
            <form onSubmit={handleAddEquipment} style={{ padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid var(--edge-t16, #cbd5e1)', background: 'var(--surface-color, #fff)', display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>Add New Equipment</div>
              {errorMsg && <div style={{ color: 'red', fontSize: '0.8rem' }}>{errorMsg}</div>}
              <input name="name" required placeholder="Equipment Name *" className="form-input" style={{ padding: '0.3rem', fontSize: '0.85rem' }} />
              <select name="category" required className="form-input" style={{ padding: '0.3rem', fontSize: '0.85rem' }}>
                <option value="hvac">HVAC</option>
                <option value="plumbing">Plumbing</option>
                <option value="electrical">Electrical</option>
                <option value="appliance">Appliance</option>
                <option value="roof">Roof</option>
                <option value="other">Other</option>
              </select>
              <input name="brand" placeholder="Brand" className="form-input" style={{ padding: '0.3rem', fontSize: '0.85rem' }} />
              <input name="modelNumber" placeholder="Model Number" className="form-input" style={{ padding: '0.3rem', fontSize: '0.85rem' }} />
              <input name="serialNumber" placeholder="Serial Number" className="form-input" style={{ padding: '0.3rem', fontSize: '0.85rem' }} />
              <textarea name="notes" placeholder="Notes" className="form-input" style={{ padding: '0.3rem', fontSize: '0.85rem' }} />
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button type="submit" className="btn primary" disabled={isPending} style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}>Save</button>
                <button type="button" onClick={() => setAddingToPassportId(null)} className="btn secondary" disabled={isPending} style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}>Cancel</button>
              </div>
            </form>
          ) : (
            <button onClick={() => setAddingToPassportId(passport.id)} className="btn secondary" style={{ marginTop: '0.75rem', padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
              + Add Equipment
            </button>
          )}

          {passport.equipment.length === 0 && addingToPassportId !== passport.id && (
            <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.5rem' }}>Passport record active. Added equipment details will appear here.</p>
          )}
        </div>
      ))}
    </section>
  );
}
