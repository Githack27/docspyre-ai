import datetime
from typing import Optional, TYPE_CHECKING
from sqlalchemy import String, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from db.entities.base import Base

if TYPE_CHECKING:
    from db.entities.user import User


class Template(Base):
    __tablename__ = "templates"

    templateId: Mapped[int] = mapped_column(primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(nullable=True)
    category: Mapped[str] = mapped_column(String(100), nullable=False)  # 'resume', 'legal', 'academic', etc.
    filePath: Mapped[str] = mapped_column(String(512), nullable=False)
    isPublic: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    ownerId: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.userId", ondelete="SET NULL"), nullable=True, index=True
    )

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
    owner: Mapped[Optional["User"]] = relationship("User", back_populates="templates")
