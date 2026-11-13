"""Authentication and user schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class Token(BaseModel):
    """Schema for the JWT access token returned on successful login."""

    access_token: str
    token_type: str


class UserBase(BaseModel):
    username: str


class UserCreate(UserBase):
    """Schema for creating a new user (requires plain text password)."""

    password: str


class UserOut(UserBase):
    """Schema for returning user data (excludes sensitive credentials)."""

    id: UUID
    role: str

    model_config = ConfigDict(from_attributes=True)


class PasswordReset(BaseModel):
    """Body of POST /api/auth/reset: the code from the link and the new password."""

    code: str
    password: str


class ResetCodeInfo(BaseModel):
    """Who a reset link (or a spent one) is for, so the page can say so and
    the sign-in form can be pre-filled."""

    username: str


class ResetLinkResponse(BaseModel):
    """A new reset link. The code inside it is not stored, so this is the only
    time it can be shown."""

    link: str
    expires_at: datetime
