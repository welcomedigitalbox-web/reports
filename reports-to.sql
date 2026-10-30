-- Who answers to whom. The review page needs this to group a manager's
-- own people under them instead of showing one flat list of whoever
-- happened to file something.
begin;

-- Online team and wholesale -> sales & marketing AM.
update public.profiles p
   set reports_to = (select id from public.profiles where email = 'sales-am@edu.com')
 where (p.email like 'sales-os%@edu.com' or p.email like 'sales-wholesale%@edu.com')
   and p.email <> 'sales-am@edu.com';

-- Shop floor -> area sale manager.
update public.profiles p
   set reports_to = (select id from public.profiles where email like 'sale-area%@edu.com' limit 1)
 where p.role in ('cashier','shop_incharge','sale_staff','sale_associate')
   and p.reports_to is null;

-- Both managers -> sale manager.
update public.profiles p
   set reports_to = (select id from public.profiles where email like 'sale-manager%@edu.com' limit 1)
 where p.email in ('sales-am@edu.com')
    or p.email like 'sale-area%@edu.com';

commit;

-- The tree, to check by eye.
select coalesce(m.email, '(no manager)') as manager, p.email, p.role, p.department
  from public.profiles p
  left join public.profiles m on m.id = p.reports_to
 where p.department = 'sale'
 order by 1, 2;
