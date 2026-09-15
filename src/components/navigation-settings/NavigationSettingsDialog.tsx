'use client';

import React, { useState } from 'react';
import { NavView, NavigationPreferences, NavGroupDef } from '@/lib/navigation/types';
import { saveNavigationPreferencesAction } from '@/app/dashboard/navigation-actions';
import { PRESETS } from '@/lib/navigation/presets';
import { CATALOG_GROUPS, CATALOG_ITEMS } from '@/lib/navigation/catalog';

export function NavigationSettingsDialog({ onClose }: { onClose: () => void }) {
  const [selectedView, setSelectedView] = useState<NavView>('balanced');
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [customLayout, setCustomLayout] = useState<NavigationPreferences['customLayout'] | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveNavigationPreferencesAction({
        selectedView,
        favoriteIds,
        customLayout: selectedView === 'custom' ? customLayout : null,
      });
      onClose();
      window.location.reload();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="nav-settings-modal-overlay" style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div className="nav-settings-modal" style={{
        backgroundColor: 'white', padding: '2rem', borderRadius: '8px', maxWidth: '600px', width: '100%',
        maxHeight: '90vh', overflowY: 'auto'
      }}>
        <h2 style={{marginTop: 0}}>Navigation settings</h2>
        <div style={{ margin: '1rem 0', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {(Object.entries(PRESETS) as [Exclude<NavView, 'custom'>, { description: string }][]).map(([key, preset]) => (
            <label key={key} style={{ display: 'flex', gap: '1rem', cursor: 'pointer', padding: '0.5rem', border: '1px solid #eee', borderRadius: '4px', backgroundColor: selectedView === key ? '#f0f9ff' : 'transparent' }}>
              <input
                type="radio"
                name="nav-preset"
                value={key}
                checked={selectedView === key}
                onChange={() => setSelectedView(key)}
              />
              <div>
                <strong>{key.charAt(0).toUpperCase() + key.slice(1)}</strong>
                <p style={{ margin: 0, fontSize: '0.9rem', color: '#666' }}>{preset.description}</p>
              </div>
            </label>
          ))}
          <label style={{ display: 'flex', gap: '1rem', cursor: 'pointer', padding: '0.5rem', border: '1px solid #eee', borderRadius: '4px', backgroundColor: selectedView === 'custom' ? '#f0f9ff' : 'transparent' }}>
            <input
              type="radio"
              name="nav-preset"
              value="custom"
              checked={selectedView === 'custom'}
              onChange={() => {
                setSelectedView('custom');
                if (!customLayout) {
                  // Initialize custom layout from balanced
                  setCustomLayout({
                    basePreset: 'balanced',
                    presentation: 'grouped',
                    groups: CATALOG_GROUPS.map(g => ({
                      id: g.id,
                      label: g.label,
                      itemIds: CATALOG_ITEMS.filter(i => i.defaultGroupId === g.id).map(i => i.id)
                    })),
                    hiddenIds: []
                  });
                }
              }}
            />
            <div>
              <strong>My custom layout</strong>
              <p style={{ margin: 0, fontSize: '0.9rem', color: '#666' }}>Create and edit your own layout.</p>
            </div>
          </label>
        </div>

        {selectedView === 'custom' && customLayout && (
          <div className="custom-layout-editor" style={{ marginTop: '1rem', padding: '1rem', border: '1px dashed #ccc', borderRadius: '4px' }}>
            <h4>Customize Layout</h4>
            <p style={{ fontSize: '0.9rem', color: '#666' }}>Drag and drop is not fully implemented in this demo. Here you would order groups and assign items.</p>
            {customLayout.groups.map((g: any) => (
              <div key={g.id} style={{ marginBottom: '1rem' }}>
                <strong>{g.label}</strong>
                <div style={{ paddingLeft: '1rem' }}>
                  {g.itemIds.map((itemId: string) => {
                    const item = CATALOG_ITEMS.find(i => i.id === itemId);
                    return item ? <div key={item.id} style={{ fontSize: '0.9rem' }}>• {item.label}</div> : null;
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
          <button onClick={onClose} disabled={isSaving} style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSave} disabled={isSaving} style={{ padding: '0.5rem 1rem', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            {isSaving ? 'Saving...' : 'Save navigation'}
          </button>
        </div>
      </div>
    </div>
  );
}
