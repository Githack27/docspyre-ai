import os
import sys
import pathlib
from alembic.config import Config
from alembic import command
from sqlalchemy import create_engine, text

# Add current directory to path so that "db" package is importable
current_dir = str(pathlib.Path(__file__).parent.resolve())
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from db.config import DATABASE_URL

def get_base_url(url: str) -> str:
    # Extracts the host, port, user, etc. and connects to 'postgres' default database
    # Example: postgresql+psycopg://postgres@localhost:5434/docspyre -> postgresql+psycopg://postgres@localhost:5434/postgres
    parts = url.rsplit('/', 1)
    if len(parts) == 2:
        return f"{parts[0]}/postgres"
    return url

def init_database():
    print("Checking if database 'docspyre' exists...")
    
    # 1. Connect to postgres default DB and check/create 'docspyre'
    base_url = get_base_url(DATABASE_URL)
    engine = create_engine(base_url, isolation_level="AUTOCOMMIT")
    
    try:
        with engine.connect() as conn:
            result = conn.execute(text("SELECT 1 FROM pg_database WHERE datname='docspyre'")).fetchone()
            if not result:
                print("Database 'docspyre' does not exist. Creating...")
                conn.execute(text("CREATE DATABASE docspyre"))
                print("Database 'docspyre' created successfully.")
            else:
                print("Database 'docspyre' already exists.")
    except Exception as e:
        print(f"Error checking/creating database: {e}")
        sys.exit(1)
    finally:
        engine.dispose()

    # Create versions directory if it doesn't exist
    versions_dir = pathlib.Path(current_dir) / "alembic" / "versions"
    versions_dir.mkdir(parents=True, exist_ok=True)

    # 2. Run Alembic setup and migrations
    alembic_cfg = Config(os.path.join(current_dir, "alembic.ini"))
    alembic_cfg.set_main_option("script_location", os.path.join(current_dir, "alembic"))
    
    # Check if there are any revision files
    revisions = list(versions_dir.glob("*.py"))
    if not revisions:
        print("No migrations found. Generating initial migration...")
        try:
            command.revision(alembic_cfg, message="Initial schema", autogenerate=True)
            print("Initial migration generated.")
        except Exception as e:
            print(f"Error generating initial migration: {e}")
            sys.exit(1)

    print("Running migrations...")
    try:
        command.upgrade(alembic_cfg, "head")
        print("Migrations applied successfully.")
    except Exception as e:
        print(f"Error applying migrations: {e}")
        sys.exit(1)

    # 3. Apply custom functions and triggers
    print("Applying database functions and triggers...")
    db_engine = create_engine(DATABASE_URL)
    
    functions_file = pathlib.Path(current_dir) / "db" / "functions" / "functions.sql"
    triggers_file = pathlib.Path(current_dir) / "db" / "triggers" / "triggers.sql"

    try:
        with db_engine.begin() as conn:
            # Execute functions
            if functions_file.exists():
                print(f"Executing {functions_file.name}...")
                sql_content = functions_file.read_text(encoding="utf-8")
                # Run the whole file as a single statement block
                conn.execute(text(sql_content))
            
            # Execute triggers
            if triggers_file.exists():
                print(f"Executing {triggers_file.name}...")
                sql_content = triggers_file.read_text(encoding="utf-8")
                # Run triggers script
                conn.execute(text(sql_content))
                
        print("Database functions and triggers applied successfully.")
    except Exception as e:
        print(f"Error applying functions/triggers: {e}")
        sys.exit(1)
    finally:
        db_engine.dispose()

    print("Database initialization completed successfully!")

if __name__ == "__main__":
    init_database()
