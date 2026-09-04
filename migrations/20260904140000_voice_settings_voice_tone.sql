-- Add voice_tone column to voice_settings table for conversational persona customization

alter table public.voice_settings
  add column if not exists voice_tone text not null default 'professional'
  check (voice_tone in ('friendly', 'professional', 'urgent_dispatcher'));

comment on column public.voice_settings.voice_tone is
  'Conversational persona: friendly, professional, or urgent_dispatcher.';
