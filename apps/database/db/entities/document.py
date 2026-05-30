import datetime
from typing import Any, Optional, TYPE_CHECKING
from sqlalchemy import String, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from db.entities.base import Base

if TYPE_CHECKING:
    from db.entities.user import User
    from db.entities.document_status import DocumentStatus
    from db.entities.document_content import DocumentContent
    from db.entities.document_conversion import DocumentConversion
    from db.entities.transcription import Transcription
    from db.entities.translation import Translation


class Document(Base):
    __tablename__ = "documents"

    documentId: Mapped[int] = mapped_column(primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    filePath: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    
    statusId: Mapped[int] = mapped_column(ForeignKey("document_statuses.statusId"), nullable=False)
    ownerId: Mapped[int] = mapped_column(ForeignKey("users.userId", ondelete="CASCADE"), nullable=False, index=True)
    
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
    owner: Mapped["User"] = relationship("User", back_populates="documents")
    status: Mapped["DocumentStatus"] = relationship("DocumentStatus", back_populates="documents")
    contentDetail: Mapped[Optional["DocumentContent"]] = relationship(
        "DocumentContent", back_populates="document", uselist=False, cascade="all, delete-orphan"
    )
    conversions: Mapped[list["DocumentConversion"]] = relationship(
        "DocumentConversion", back_populates="document", cascade="all, delete-orphan"
    )
    transcriptions: Mapped[list["Transcription"]] = relationship(
        "Transcription", back_populates="document", cascade="all, delete-orphan"
    )
    translations: Mapped[list["Translation"]] = relationship(
        "Translation", back_populates="document", cascade="all, delete-orphan"
    )

    @property
    def content(self) -> Optional[str]:
        return self.contentDetail.content if self.contentDetail else None

    @property
    def metadataJson(self) -> Optional[dict[str, Any]]:
        return self.contentDetail.metadataJson if self.contentDetail else None
