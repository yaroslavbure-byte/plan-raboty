// Supabase Edge Function «push»: отправляет Web Push при новой строке в notifications.
// Вызывается Database Webhook'ом (Database → Webhooks → INSERT on public.notifications).
// Секреты (Edge Functions → Secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:you@example.com)
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
);

const verbs: Record<string, string> = {
  added: 'добавил(а) задачу', attached: 'прикрепил(а) видео к', completed: 'выполнил(а)', edited: 'изменил(а)', moved: 'перенёс(ла)', deleted: 'удалил(а)',
};

function when(date?: string | null, time?: string | null) {
  if (!date) return time ?? '';
  const [y, m, d] = date.split('-');
  return `${d}.${m}${time ? ', ' + time : ''}`;
}

Deno.serve(async (req) => {
  const payload = await req.json();
  const n = payload.record;
  if (!n) return new Response('no record', { status: 400 });

  const { data: actor } = await supabase.from('profiles').select('name').eq('id', n.actor_id).single();
  const name = actor?.name || 'Партнёр';
  const w = when(n.date, n.time);
  const body = n.kind === 'added' && !n.shared
    ? `Тебе добавили задачу: ${n.title}${w ? ' — ' + w : ''}`
    : `${name} ${verbs[n.kind] ?? 'изменил(а)'}: ${n.title}${w ? ' — ' + w : ''}`;

  const { data: subs } = await supabase.from('push_subscriptions').select('*').eq('user_id', n.user_id);
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(s.subscription, JSON.stringify({ title: 'План работы', body }));
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
      }
    }
  }
  return new Response('ok');
});
