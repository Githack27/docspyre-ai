import datetime
from typing import Any, Optional, TYPE_CHECKING
from sqlalchemy import DateTime, ForeignKey, JSON, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from db.entities.base import Base

if TYPE_CHECKING:
    from db.entities.document import Document


class DocumentContent(Base):
    __tablename__ = "document_contents"

    contentId: Mapped[int] = mapped_column(primary_key=True, index=True)
    documentId: Mapped[int] = mapped_column(
        ForeignKey("documents.documentId", ondelete="CASCADE"), unique=True, index=True, nullable=False
    )
    content: Mapped[Optional[str]] = mapped_column(nullable=True)
    metadataJson: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)

    # Audit fields
    createdDate: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    createdBy: Mapped[str] = mapped_column(String(255), server_default="system", nullable=False)
    lastUpdatedDate: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    lastUpdatedBy: Mapped[str] = mapped_column(String(255), server_default="system", nullable=False)

    # Relationships
    document: Mapped["Document"] = relationship("Document", back_populates="contentDetail")
