import datetime
from typing import Optional, TYPE_CHECKING
from sqlalchemy import String, DateTime, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from db.entities.base import Base

if TYPE_CHECKING:
    from db.entities.user import User


class SubscriptionPlan(Base):
    __tablename__ = "subscription_plans"

    planId: Mapped[int] = mapped_column(primary_key=True, index=True)
    planName: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    price: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    limitConversions: Mapped[Optional[int]] = mapped_column(nullable=True)
    limitAiUsage: Mapped[Optional[int]] = mapped_column(nullable=True)

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
    users: Mapped[list["User"]] = relationship("User", back_populates="plan")
