# SIP House Designer — этап 1 (каркас)

Desktop-приложение для проектирования SIP-домов на **Tauri 2**, **React 18**, **TypeScript (strict)**, **Vite**, **Zustand**, **PixiJS** (2D) и **React Three Fiber** (3D).

## Запуск

```bash
npm install
npm run tauri dev
```

Только фронтенд (без нативного shell):

```bash
npm run dev
```

Сборка десктопа:

```bash
npm run tauri build
```

Тесты:

```bash
npm test
```

## Архитектура (слои)

| Путь | Назначение |
|------|------------|
| `src/core/domain` | Модель проекта: сущности, фабрики, демо-данные. Без UI и без canvas. |
| `src/core/geometry` | Чистая 2D-геометрия в **мм**: точки, векторы, отрезки, bbox, сравнения с ε. |
| `src/core/rules` | Зарезервировано под правила SIP (этап 1 — заглушка). |
| `src/core/validation` | JSON Schema **v0** и проверка через Ajv. |
| `src/core/io` | Сериализация, формат файла (wire v0), сохранение/загрузка (Tauri FS + dialog, fallback в браузере). |
| `src/store` | Zustand: проект, выбор, инструменты, viewport, UI-панели, dirty, скелет undo/redo. |
| `src/features/project` | Команды проекта (фасад над store). |
| `src/features/editor2d` | Только отображение: Pixi, сетка, pan/zoom, read-only стены. |
| `src/features/editor3d` | R3F: сетка, оси, placeholder-объём. |
| `src/features/ui` | Shell: верхняя панель, слева инструменты, справа свойства, статус, вкладки 2D/3D. |
| `src/app` | Корневой UI и баннер ошибок. |
| `src/shared` | Общие константы. |

**Принципы:** домен и геометрия — чистые данные и функции; React только подписывается на store и рендерит; Pixi/Three не владеют источником правды.

## Формат файла (wire v0)

В JSON-корне обязательны: `schemaVersion` (0), `id`, `name`, `createdAt`, `updatedAt`, `units: "mm"`, массивы сущностей и объекты `foundation`, `roof`, `materialSet`, `settings`, `viewState`. В оперативной модели те же поля сгруппированы в `meta` + тело проекта; при сохранении используется плоский вид (`projectToWire` / `projectFromWire`).

## Версионирование схемы

`PROJECT_SCHEMA_VERSION` и `schemaVersion` в файле совпадают на этапе 1. Дальше — отдельные миграции в `core/io` (пока не реализованы).

## Ограничения этапа 1

Нет редактирования стен, привязок, генерации кровли/листов, PDF и т.д. — только фундамент для следующих спринтов.
