import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, ConfigDict


class UserBase(BaseModel):
    email: EmailStr
    isActive: Optional[bool] = True


class UserCreate(UserBase):
    password: str
    roleId: int
    planId: Optional[int] = None


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    password: Optional[str] = None
    isActive: Optional[bool] = None
    roleId: Optional[int] = None
    planId: Optional[int] = None


class UserResponse(UserBase):
    userId: int
    roleId: int
    planId: Optional[int] = None
    createdDate: datetime.datetime
    lastUpdatedDate: datetime.datetime

    model_config = ConfigDict(from_attributes=True)


# For backward compatibility
class User(UserResponse):
    pass
