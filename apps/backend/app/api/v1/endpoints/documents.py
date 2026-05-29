from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

# Import database module from docspyre-database package
from db.connection import get_db
from db.entities.document import Document as DbDocument
from app import schemas

router = APIRouter()


@router.post("/", response_model=schemas.DocumentResponse, status_code=status.HTTP_201_CREATED)
def create_document(doc_in: schemas.DocumentCreate, db: Session = Depends(get_db)) -> Any:
    """Create a new document."""
    db_doc = DbDocument(
        title=doc_in.title,
        content=doc_in.content,
        file_path=doc_in.file_path,
        status=doc_in.status,
        metadata_json=doc_in.metadata_json,
        owner_id=doc_in.owner_id,
    )
    db.add(db_doc)
    db.commit()
    db.refresh(db_doc)
    return db_doc


@router.get("/", response_model=list[schemas.DocumentResponse])
def read_documents(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)) -> Any:
    """Retrieve documents."""
    documents = db.query(DbDocument).offset(skip).limit(limit).all()
    return documents


@router.get("/{doc_id}", response_model=schemas.DocumentResponse)
def read_document(doc_id: int, db: Session = Depends(get_db)) -> Any:
    """Get document by ID."""
    doc = db.query(DbDocument).filter(DbDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(
            status_code=404,
            detail="Document not found",
        )
    return doc
