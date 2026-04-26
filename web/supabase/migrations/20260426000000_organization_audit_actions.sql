alter type public.audit_action add value if not exists 'organization.invitation_created';
alter type public.audit_action add value if not exists 'organization.invitation_revoked';
alter type public.audit_action add value if not exists 'organization.invitation_resent';
alter type public.audit_action add value if not exists 'organization.invitation_accepted';
alter type public.audit_action add value if not exists 'organization.member_role_updated';
alter type public.audit_action add value if not exists 'organization.member_removed';

create index if not exists audit_events_organization_id_created_at_idx
on public.audit_events (organization_id, created_at desc);

create policy "audit_events_organization_member_select" on public.audit_events
for select using (
  organization_id is not null
  and public.is_org_member(organization_id)
);
