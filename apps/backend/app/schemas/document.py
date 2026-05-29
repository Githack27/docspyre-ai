import datetime
from typing import Any, Optional
from pydantic import BaseModel, ConfigDict


class DocumentBase(BaseModel):
    title: str
    content: Optional[str] = None
    file_path: Optional[str] = None
    status: Optional[str] = "pending"
    metadata_json: Optional[dict[str, Any]] = None


class DocumentCreate(DocumentBase):
    owner_id: int


class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    file_path: Optional[str] = None
    status: Optional[str] = None
    metadata_json: Optional[dict[str, Any]] = None


class DocumentResponse(DocumentBase):
    id: int
    owner_id: int
    created_at: datetime.datetime
    updated_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)


# For backward compatibility
class Document(DocumentResponse):
    pass
