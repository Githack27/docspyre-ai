from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

# Import database module from docspyre-database package
from db.connection import get_db
from db.entities.user import User as DbUser
from app import schemas

router = APIRouter()


@router.post("/", response_model=schemas.UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(user_in: schemas.UserCreate, db: Session = Depends(get_db)) -> Any:
    """Create new user."""
    user = db.query(DbUser).filter(DbUser.email == user_in.email).first()
    if user:
        raise HTTPException(
            status_code=400,
            detail="The user with this email already exists in the system.",
        )
    
    # In a real app, hash password before saving
    db_user = DbUser(
        email=user_in.email,
        hashed_password=user_in.password,  # Stored directly as a mock setup
        is_active=user_in.is_active,
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


@router.get("/{user_id}", response_model=schemas.UserResponse)
def read_user_by_id(user_id: int, db: Session = Depends(get_db)) -> Any:
    """Get a specific user by id."""
    user = db.query(DbUser).filter(DbUser.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found",
        )
    return user
