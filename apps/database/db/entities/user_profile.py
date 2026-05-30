import datetime
from typing import Optional, TYPE_CHECKING
from sqlalchemy import String, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from db.entities.base import Base

if TYPE_CHECKING:
    from db.entities.user import User


class UserProfile(Base):
    __tablename__ = "user_profiles"

    profileId: Mapped[int] = mapped_column(primary_key=True, index=True)
    userId: Mapped[int] = mapped_column(
        ForeignKey("users.userId", ondelete="CASCADE"), unique=True, index=True, nullable=False
    )
    firstName: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    lastName: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    companyName: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    industry: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

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
    user: Mapped["User"] = relationship("User", back_populates="profile")
