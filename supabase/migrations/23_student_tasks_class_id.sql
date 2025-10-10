alter table public.student_tasks
  add column if not exists class_id uuid references public.classes(id);

create index if not exists student_tasks_class_idx on public.student_tasks(class_id);

update public.student_tasks st
set class_id = cs.class_id
from public.class_students cs
where st.class_id is null
  and cs.student_id = st.student_id;
