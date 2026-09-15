'use client';
import React, { useState } from 'react';

export default function ClientUploadForm({ caseId, accountId }: { caseId: string; accountId: string }) {
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setUploading(true);
    // In a real implementation we would call a server action to get a signed upload URL
    // then put the file to Supabase Storage.
    // For MVP, we mock the success.
    setTimeout(() => {
      alert('Upload successful (MVP mock)');
      setUploading(false);
    }, 1000);
  };

  return (
    <div className="mt-2">
      <label className="px-3 py-1 bg-blue-100 text-blue-800 rounded text-sm cursor-pointer hover:bg-blue-200 inline-block font-medium">
        {uploading ? 'Uploading...' : 'Upload Document'}
        <input 
          type="file" 
          className="hidden" 
          accept="application/pdf,image/jpeg,image/png"
          onChange={handleUpload}
          disabled={uploading}
        />
      </label>
    </div>
  );
}
