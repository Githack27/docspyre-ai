# Docspyre AI

An AI-powered document processing and management platform.

## What's inside?

This Turborepo monorepo includes the following packages/apps:

### Apps and Packages

- `web`: [Next.js](https://nextjs.org/) application with Tauri desktop support
- `@repo/ai`: AI integration and processing utilities
- `@repo/api-client`: API client for backend communication
- `@repo/auth`: Authentication and authorization utilities
- `@repo/database`: Database schemas and utilities
- `@repo/editor`: Document editor components
- `@repo/prompts`: AI prompt templates and management
- `@repo/types`: Shared TypeScript types
- `@repo/ui`: Shared React component library
- `@repo/eslint-config`: ESLint configurations
- `@repo/typescript-config`: TypeScript configurations

Each package/app is 100% [TypeScript](https://www.typescriptlang.org/).

### Utilities

This Turborepo has some additional tools already setup for you:

- [TypeScript](https://www.typescriptlang.org/) for static type checking
- [ESLint](https://eslint.org/) for code linting
- [Prettier](https://prettier.io) for code formatting

### Build

To build all apps and packages:

```sh
pnpm build
```

To build a specific package:

```sh
pnpm --filter web build
```

### Development

To start the development server:

```sh
pnpm dev
```

To run the Tauri desktop app in development:

```sh
pnpm tauri:dev
```

### Other Commands

Type checking:
```sh
pnpm check-types
```

Linting:
```sh
pnpm lint
```

Code formatting:
```sh
pnpm format
```

Build Tauri desktop app:
```sh
pnpm tauri:build
```

## Database Setup & Migrations

The project uses PostgreSQL with SQLAlchemy and Alembic for migrations. The database module is located in `apps/database`.

### Database Initialization

To check/create the database, run migrations, and apply SQL functions/triggers:
1. Ensure the PostgreSQL server is running (by default on port `5434`).
2. Run the initialization script from the project root:
   ```sh
   .venv\Scripts\python apps/database/init_db.py
   ```

### Working with Migrations

To generate a new database migration after modifying the Python entities:
1. Make the schema changes in `apps/database/db/entities/`.
2. Run the following commands from the `apps/database` directory:
   ```sh
   cd apps/database
   ..\..\.venv\Scripts\alembic revision --autogenerate -m "Description of changes"
   ..\..\.venv\Scripts\alembic upgrade head
   ```

## Tech Stack

- **Frontend**: Next.js 16, React 19, TailwindCSS, Framer Motion
- **Desktop**: Tauri
- **Build Tool**: Turborepo
- **Package Manager**: pnpm
- **Language**: TypeScript
