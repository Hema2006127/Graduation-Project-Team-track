-- Public bucket for optional member profile images. Only admins can write.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "avatars: public read" on storage.objects for select
  using (bucket_id = 'avatars');
create policy "avatars: admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and public.is_admin());
create policy "avatars: admin update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and public.is_admin());
create policy "avatars: admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and public.is_admin());
