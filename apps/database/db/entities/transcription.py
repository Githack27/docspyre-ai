import datetime
from typing import Optional, TYPE_CHECKING
from sqlalchemy import String, DateTime, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from db.entities.base import Base

if TYPE_CHECKING:
    from db.entities.document import Document


class Transcription(Base):
    __tablename__ = "transcriptions"

    transcriptionId: Mapped[int] = mapped_column(primary_key=True, index=True)
    documentId: Mapped[int] = mapped_column(
        ForeignKey("documents.documentId", ondelete="CASCADE"), index=True, nullable=False
    )
    mediaPath: Mapped[str] = mapped_column(String(512), nullable=False)
    mediaType: Mapped[str] = mapped_column(String(50), nullable=False)  # 'audio', 'video'
    durationSeconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    language: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending")

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
    document: Mapped["Document"] = relationship("Document", back_populates="transcriptions")
