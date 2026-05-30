import datetime
from typing import TYPE_CHECKING
from sqlalchemy import String, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from db.entities.base import Base

if TYPE_CHECKING:
    from db.entities.workspace import Workspace
    from db.entities.user import User


class WorkspaceMember(Base):
    __tablename__ = "workspace_members"

    workspaceMemberId: Mapped[int] = mapped_column(primary_key=True, index=True)
    workspaceId: Mapped[int] = mapped_column(
        ForeignKey("workspaces.workspaceId", ondelete="CASCADE"), index=True, nullable=False
    )
    userId: Mapped[int] = mapped_column(
        ForeignKey("users.userId", ondelete="CASCADE"), index=True, nullable=False
    )
    roleInWorkspace: Mapped[str] = mapped_column(String(50), default="member", nullable=False)

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
    workspace: Mapped["Workspace"] = relationship("Workspace", back_populates="members")
    user: Mapped["User"] = relationship("User", back_populates="workspaceMemberships")
