from sqlalchemy import create_engine, Column, String, Float, ForeignKey, Integer, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from datetime import datetime
from os import getenv

DATABASE_URL = getenv("DATABASE_URL")

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=300, 
    pool_size=10,
    max_overflow=20,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=True)
    email = Column(String(255), unique=True, index=True, nullable=True)
    google_id = Column(String(100), unique=True, index=True, nullable=True)
    hashed_password = Column(String(255), nullable=True)
    auth_type = Column(String(20), default="local")
    created_at = Column(DateTime, default=datetime.utcnow)
    
    results = relationship("UserResult", back_populates="user", uselist=False)

class UserResult(Base):
    __tablename__ = "user_results"
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    max_typing_speed = Column(Float, default=0.0)
    total_tests = Column(Integer, default=0)
    
    user = relationship("User", back_populates="results")

def init_db():
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()