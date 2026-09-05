'use client';

import { useState, useTransition } from 'react';
import type { TrashItem, RecoverableEntityType } from '@/lib/recoverable-deletions';
import { restoreTrashItemAction } from './actions';

interface TrashBinClientProps {
  initialItems: TrashItem[];
}

const TABS: { id: string; label: string; type?: RecoverableEntityType }[] = [
  { id: 'all', label: 'All Trashed' },
  { id: 'lead', label: 'Leads', type: 'lead' },
  { id: 'crew', label: 'Crew', type: 'crew' },
  { id: 'service', label: 'Services', type: 'service' },
  { id: 'job', label: 'Jobs', type: 'job' },
  { id: 'attachment', label: 'Files', type: 'attachment' },
];

export default function TrashBinClient({ initialItems }: TrashBinClientProps) {
  const [selectedTab, setSelectedTab] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filteredItems = initialItems.filter((item) => {
    if (selectedTab !== 'all' && item.entityType !== selectedTab) {
      return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      const title = (item.displaySnapshot.title || '').toLowerCase();
      const subtitle = (item.displaySnapshot.subtitle || '').toLowerCase();
      const reason = (item.deletionReason || '').toLowerCase();
      return title.includes(q) || subtitle.includes(q) || reason.includes(q);
    }
    return true;
  });

  const handleRestore = (item: TrashItem) => {
    setRestoringId(item.id);
    startTransition(async () => {
      try {
        await restoreTrashItemAction(item.entityType, item.entityId);
      } catch (err: any) {
        alert(err.message || 'Failed to restore item');
      } finally {
        setRestoringId(null);
      }
    });
  };

  const getConservativeHint = (entityType: RecoverableEntityType) => {
    switch (entityType) {
      case 'crew':
        return 'Restores as Inactive on roster';
      case 'lead':
        return 'Restores as Archived lead';
      case 'service':
        return 'Restores as Disabled service';
      case 'job':
        return 'Restores to Job pipeline';
      case 'attachment':
        return 'Restores file access';
      default:
        return 'Restores record';
    }
  };

  const getEntityIcon = (entityType: RecoverableEntityType) => {
    switch (entityType) {
      case 'lead':
        return '🎯';
      case 'crew':
        return '👷';
      case 'service':
        return '🏷️';
      case 'job':
        return '🔨';
      case 'attachment':
        return '📎';
      default:
        return '📄';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and explanation banner */}
      <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
              <span>🗑️</span> 30-Day Trash & Recovery Bin
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Soft-deleted records remain recoverable here for 30 days before permanent automated disposal.
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/50 text-xs text-slate-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
            <span>Conservative Restoration Enabled</span>
          </div>
        </div>
      </div>

      {/* Tabs & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex flex-wrap gap-2">
          {TABS.map((tab) => {
            const count = tab.id === 'all'
              ? initialItems.length
              : initialItems.filter((i) => i.entityType === tab.type).length;
            const active = selectedTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSelectedTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                  active
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <span>{tab.label}</span>
                {count > 0 && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-xs ${
                      active ? 'bg-blue-800 text-blue-100' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="relative">
          <input
            type="text"
            placeholder="Search deleted records..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-64 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* List / Empty State */}
      {filteredItems.length === 0 ? (
        <div className="text-center py-16 px-4 rounded-2xl bg-slate-900/50 border border-slate-800/80">
          <div className="text-4xl mb-3">✨</div>
          <h3 className="text-base font-semibold text-slate-200">Trash Bin is Empty</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto mt-1">
            {search
              ? 'No deleted records matched your search query.'
              : 'No records pending deletion. Deleted leads, crew, services, and jobs will appear here for 30 days.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems.map((item) => {
            const isItemRestoring = restoringId === item.id || isPending;
            const daysLeft = item.daysRemaining;

            return (
              <div
                key={item.id}
                className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm hover:border-slate-700 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{getEntityIcon(item.entityType)}</span>
                      <span className="text-xs uppercase tracking-wider font-bold text-slate-400">
                        {item.entityType}
                      </span>
                    </div>
                    <span
                      className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${
                        daysLeft <= 5
                          ? 'bg-red-500/10 text-red-400 border-red-500/20'
                          : daysLeft <= 15
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          : 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}
                    >
                      ⏳ {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left
                    </span>
                  </div>

                  <h4 className="font-semibold text-slate-100 text-base line-clamp-1">
                    {item.displaySnapshot.title || 'Untitled Record'}
                  </h4>

                  {item.displaySnapshot.subtitle && (
                    <p className="text-sm text-slate-400 mt-0.5 line-clamp-1">
                      {item.displaySnapshot.subtitle}
                    </p>
                  )}

                  {item.displaySnapshot.badge && (
                    <div className="mt-2">
                      <span className="inline-block text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                        {item.displaySnapshot.badge}
                      </span>
                    </div>
                  )}

                  <div className="mt-4 pt-3 border-t border-slate-800/80 text-xs text-slate-500 space-y-1">
                    <div className="flex justify-between">
                      <span>Deleted:</span>
                      <span className="text-slate-400">
                        {new Date(item.deletedAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                    {item.deletionReason && (
                      <div className="flex justify-between">
                        <span>Reason:</span>
                        <span className="text-slate-400 truncate max-w-[160px]">
                          {item.deletionReason}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-slate-800 flex flex-col gap-2">
                  <p className="text-[11px] text-slate-500 italic">
                    ℹ️ {getConservativeHint(item.entityType)}
                  </p>
                  <button
                    onClick={() => handleRestore(item)}
                    disabled={isItemRestoring}
                    className="w-full py-2 px-3 rounded-lg text-sm font-semibold bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-600/30 hover:text-emerald-200 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                  >
                    {isItemRestoring ? (
                      <span>Restoring...</span>
                    ) : (
                      <>
                        <span>↺</span>
                        <span>Restore Record</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
