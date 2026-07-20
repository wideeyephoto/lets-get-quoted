'use client';

import { useRef } from 'react';
import { useFormStatus } from 'react-dom';

type CrewPhotoUploadProps = {
  // Bound server action: updateCrewPhotoAction.bind(null, member.id)
  action: (formData: FormData) => void | Promise<void>;
  photoUrl: string | null;
  initials: string;
  name: string;
};

// The avatar itself is the upload control. Clicking the "+" badge opens the
// file picker; choosing a file auto-submits the form. There is no separate
// "Save" button, so the old crash (submitting with no file selected) can't
// happen — the action only ever runs with a file attached.
function AvatarContent({ photoUrl, initials }: { photoUrl: string | null; initials: string }) {
  const { pending } = useFormStatus();
  return (
    <>
      <span className="crew-avatar">
        {photoUrl ? <img src={photoUrl} alt="" /> : <span>{initials}</span>}
      </span>
      <span className={`crew-avatar-add${pending ? ' pending' : ''}`} aria-hidden="true">
        {pending ? '…' : '+'}
      </span>
    </>
  );
}

export default function CrewPhotoUpload({ action, photoUrl, initials, name }: CrewPhotoUploadProps) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form action={action} ref={formRef} className="crew-photo-upload-form">
      <label className="crew-avatar-upload" title={photoUrl ? `Change ${name}'s photo` : `Add a photo for ${name}`}>
        <AvatarContent photoUrl={photoUrl} initials={initials} />
        <input
          name="photo"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          capture="environment"
          className="crew-avatar-input"
          aria-label={photoUrl ? `Change ${name}'s photo` : `Add a photo for ${name}`}
          onChange={(event) => {
            if (event.currentTarget.files && event.currentTarget.files.length > 0) {
              formRef.current?.requestSubmit();
            }
          }}
        />
      </label>
    </form>
  );
}
