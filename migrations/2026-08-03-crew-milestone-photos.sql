-- Let the crew attach the proof.
--
-- Proof-to-Pay gates a stage payment on before/after photos, but only the owner
-- could attach them — and the owner is in a van somewhere else. The people
-- holding the photographs are standing on site, which made the whole feature
-- depend on somebody emailing pictures to somebody else at the end of the day.
--
-- Crew may INSERT a photo on a job they are assigned to, and read what's on that
-- job. They may NOT delete one: removing evidence from a payment gate is an
-- owner decision, and a crew member who took a bad photo can simply take
-- another.

drop policy if exists milestone_photos_crew_insert on milestone_photos;
create policy milestone_photos_crew_insert on milestone_photos
  for insert with check (
    exists (
      select 1
        from crew_assignments ca
        join crew c on c.id = ca.crew_id
       where ca.account_id = milestone_photos.account_id
         and ca.job_id = milestone_photos.job_id
         and c.user_id = auth.uid()
    )
  );

drop policy if exists milestone_photos_crew_read on milestone_photos;
create policy milestone_photos_crew_read on milestone_photos
  for select using (
    exists (
      select 1
        from crew_assignments ca
        join crew c on c.id = ca.crew_id
       where ca.account_id = milestone_photos.account_id
         and ca.job_id = milestone_photos.job_id
         and c.user_id = auth.uid()
    )
  );

-- Crew need to SEE the stages to know which one a photo belongs to. Read only:
-- amounts and payment state are the owner's business, and a crew member cannot
-- change what a stage requires or what it is worth.
drop policy if exists job_milestones_crew_read on job_milestones;
create policy job_milestones_crew_read on job_milestones
  for select using (
    exists (
      select 1
        from crew_assignments ca
        join crew c on c.id = ca.crew_id
       where ca.account_id = job_milestones.account_id
         and ca.job_id = job_milestones.job_id
         and c.user_id = auth.uid()
    )
  );
