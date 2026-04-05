from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

# Detectar URL de base de datos (Supabase/Render) o usar SQLite local por defecto
DATABASE_URL = os.getenv("DATABASE_URL")

# Si es PostgreSQL (Supabase), ajustamos para que SQLAlchemy lo acepte (a veces viene como postgres://)
if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

if not DATABASE_URL:
    # Si no hay nube, usamos el archivo local gymkana.db
    DATABASE_URL = "sqlite:///./gymkana.db"

# Configuramos el motor según sea SQLite o PostgreSQL
if "sqlite" in DATABASE_URL:
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    engine = create_engine(DATABASE_URL)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
