# План работы — заметки для Claude

Планировщик для двоих (Ярослав и девушка): Electron (Windows) + тот же React-код как PWA (iPhone/Android), сервер — Supabase.

## Структура
- `src/` — React + TS. `store.ts` (данные, офлайн-очередь, realtime, автообновление), `App.tsx` (экран), `Modals.tsx`, `Extras.tsx` (подпункты, ссылки, видео, прогресс, описание), `media.ts` (Storage + офлайн-кэш IndexedDB), `theme.ts`.
- `electron/` — main/preload (трей, electron-updater, generic feed = GitHub Releases latest/download).
- `supabase/migrations/*.sql` — идемпотентные миграции (можно запускать повторно). `supabase/functions/push` — Web Push.
- Новые поля задач хранить в `tasks.extra` (jsonb) — тогда миграции не нужны.

## Выпуск новой версии (пользователь ничего не делает)
1. Поднять `version` в `package.json`.
2. `npm run build` локально для проверки (tsc + vite).
3. Коммит в `main`, `git tag vX.Y.Z`, push ветки и тега.
4. GitHub Actions (`.github/workflows/release.yml`) собирает установщик и публикует Release → Windows-приложение само скачивает и показывает «Перезапустить и обновить».
5. Netlify (сайт willowy-semifreddo-fedcc8) сам собирает сайт из `main` → PWA перезагружается при открытии (version.json).
6. Если менялась схема БД — новая миграция в `supabase/migrations/`; без секрета `SUPABASE_DB_URL` пользователь запускает её через жёлтую плашку в приложении (кнопка копирования SQL).

## Ограничения
- Бесплатный Supabase: 50 МБ на файл, 1 ГБ хранилища. Установщик (~83 МБ) хранить только в GitHub Releases.
- Общаться с пользователем просто и по шагам, по-русски: он не разработчик.
