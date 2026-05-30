import datetime
from typing import Any, Optional
from pydantic import BaseModel, ConfigDict


class DocumentBase(BaseModel):
    title: str
    filePath: Optional[str] = None
    statusId: Optional[int] = 1
    content: Optional[str] = None
    metadataJson: Optional[dict[str, Any]] = None


class DocumentCreate(DocumentBase):
    ownerId: int


class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    filePath: Optional[str] = None
    statusId: Optional[int] = None
    content: Optional[str] = None
    metadataJson: Optional[dict[str, Any]] = None


class DocumentResponse(DocumentBase):
    documentId: int
    ownerId: int
    createdDate: datetime.datetime
    lastUpdatedDate: datetime.datetime

    model_config = ConfigDict(from_attributes=True)


# For backward compatibility
class Document(DocumentResponse):
    pass
