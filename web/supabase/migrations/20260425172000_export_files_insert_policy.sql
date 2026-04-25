create policy "export_files_project_member_insert" on public.export_files
for insert
with check (
  created_by = auth.uid()
  and public.is_project_member(project_id)
);
