create table if not exists public.help_categories (
  id text primary key,
  label text not null,
  icon text not null,
  sort_order integer not null default 0
);

alter table public.help_categories enable row level security;

drop policy if exists "help categories public read" on public.help_categories;
create policy "help categories public read"
  on public.help_categories for select
  using (true);

insert into public.help_categories (id, label, icon, sort_order)
values
  ('any', 'Любой помощник', '🎡', 1),
  ('phone', 'Телефон', '📱', 2),
  ('messengers', 'Сообщения', '💬', 3),
  ('internet', 'Интернет', '🌐', 4),
  ('settings', 'Настройки', '⚙️', 5),
  ('apps', 'Приложения', '📲', 6),
  ('payments', 'Онлайн-платежи', '💳', 7),
  ('talk', 'Просто поговорить', '❤️', 8)
on conflict (id) do update
set
  label = excluded.label,
  icon = excluded.icon,
  sort_order = excluded.sort_order;

insert into public.achievements (code, name, description, icon, xp_reward)
values
  ('tech_helper', 'Технарь', 'Помог 10 людям с телефоном.', '📱', 100),
  ('kind_voice', 'Друг на связи', 'Провел 10 добрых разговоров.', '💬', 100),
  ('caring_helper', 'Заботливый помощник', 'Помог 50 пожилым людям.', '🧓', 150),
  ('safe_helper', 'Безопасный помощник', 'Помогал без обоснованных жалоб.', '🛡️', 150),
  ('warm_talk', 'Теплый разговор', 'Получил 20 благодарностей.', '❤️', 120)
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  xp_reward = excluded.xp_reward;
