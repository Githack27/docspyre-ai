#!/bin/sh
# Shell startup script for Docspyre backend container
set -e

echo "Checking Postgres connection..."
python -c "
import time, os, sys
from sqlalchemy import create_engine
db_url = os.getenv('DATABASE_URL', 'postgresql+psycopg://postgres@docspyre_postgres:5432/docspyre')
print(f'Checking connection to: {db_url}')
for i in range(30):
    try:
        engine = create_engine(db_url)
        with engine.connect() as conn:
            print('Postgres is ready!')
            sys.exit(0)
    except Exception as e:
        print(f'Attempt {i+1}/30: Postgres not ready yet... ({e})')
        time.sleep(2)
sys.exit(1)
"

echo "Initializing database (creating tables & running migrations)..."
python /app/database/init_db.py

echo "Starting FastAPI application..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
