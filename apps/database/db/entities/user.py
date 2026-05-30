import datetime
from typing import Optional, TYPE_CHECKING
from sqlalchemy import String, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from db.entities.base import Base

if TYPE_CHECKING:
    from db.entities.role import Role
    from db.entities.subscription_plan import SubscriptionPlan
    from db.entities.user_profile import UserProfile
    from db.entities.document import Document
    from db.entities.workspace_member import WorkspaceMember
    from db.entities.template import Template


class User(Base):
    __tablename__ = "users"

    userId: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashedPassword: Mapped[str] = mapped_column(String(255), nullable=False)
    isActive: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    roleId: Mapped[int] = mapped_column(ForeignKey("roles.roleId"), nullable=False)
    planId: Mapped[Optional[int]] = mapped_column(ForeignKey("subscription_plans.planId"), nullable=True)

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
    role: Mapped["Role"] = relationship("Role", back_populates="users")
    plan: Mapped[Optional["SubscriptionPlan"]] = relationship("SubscriptionPlan", back_populates="users")
    profile: Mapped[Optional["UserProfile"]] = relationship(
        "UserProfile", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    documents: Mapped[list["Document"]] = relationship(
        "Document", back_populates="owner", cascade="all, delete-orphan"
    )
    workspaceMemberships: Mapped[list["WorkspaceMember"]] = relationship(
        "WorkspaceMember", back_populates="user", cascade="all, delete-orphan"
    )
    templates: Mapped[list["Template"]] = relationship("Template", back_populates="owner")
