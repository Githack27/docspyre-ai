from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

# Import database module from docspyre-database package
from db.connection import get_db
from db.entities.document import Document as DbDocument
from db.entities.document_content import DocumentContent as DbDocumentContent
from app import schemas

router = APIRouter()


@router.post("/", response_model=schemas.DocumentResponse, status_code=status.HTTP_201_CREATED)
def create_document(doc_in: schemas.DocumentCreate, db: Session = Depends(get_db)) -> Any:
    """Create a new document."""
    db_doc = DbDocument(
        title=doc_in.title,
        filePath=doc_in.filePath,
        statusId=doc_in.statusId or 1,
        ownerId=doc_in.ownerId,
    )
    db.add(db_doc)
    db.flush()  # Obtain the documentId

    # Create the chunked content detail record
    db_content = DbDocumentContent(
        documentId=db_doc.documentId,
        content=doc_in.content,
        metadataJson=doc_in.metadataJson,
    )
    db.add(db_content)
    
    db.commit()
    db.refresh(db_doc)
    return db_doc


@router.get("/", response_model=list[schemas.DocumentResponse])
def read_documents(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)) -> Any:
    """Retrieve documents."""
    documents = db.query(DbDocument).offset(skip).limit(limit).all()
    return documents


@router.get("/{documentId}", response_model=schemas.DocumentResponse)
def read_document(documentId: int, db: Session = Depends(get_db)) -> Any:
    """Get document by ID."""
    doc = db.query(DbDocument).filter(DbDocument.documentId == documentId).first()
    if not doc:
        raise HTTPException(
            status_code=404,
            detail="Document not found",
        )
    return doc
