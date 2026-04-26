alter table public.profiles
  add column if not exists school_name text,
  add column if not exists teacher_name text,
  add column if not exists teaching_grade text,
  add column if not exists teaching_level text;

comment on column public.profiles.school_name is '教师所在学校名称，用于自动填充参赛教案授课教师信息。';
comment on column public.profiles.teacher_name is '教师真实姓名，用于自动填充参赛教案授课教师信息。';
comment on column public.profiles.teaching_grade is '教师默认任教年级，例如：四年级。';
comment on column public.profiles.teaching_level is '教师默认水平学段，例如：水平二。';
