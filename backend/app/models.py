from pydantic import BaseModel, Field, EmailStr, ConfigDict, field_validator
from typing import Optional

class Text(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)
    time: float = Field(..., gt=0, le=300000)
    errors: int = Field(..., ge=0)
    
    @field_validator('errors')
    @classmethod
    def errors_not_more_than_text(cls, v: int, info) -> int:
        text = info.data.get('text', '')
        if v > len(text):
            raise ValueError('Ошибок не может быть больше длины текста')
        return v

class UserAuth(BaseModel):
    username: str = Field(..., min_length=3, max_length=20, pattern=r'^[a-zA-Z0-9_]+$')
    password: str = Field(..., min_length=4, max_length=100)

class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=20)
    email: Optional[EmailStr] = None
    password: str = Field(..., min_length=4)

class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    username: Optional[str] = None
    email: Optional[str] = None
    auth_type: str
    max_typing_speed: float = 0.0
    total_tests: int = 0

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class TypingResult(BaseModel):
    user_id: str
    characters: int
    errors_found: int
    seconds: float
    typing_speed: float
    max_typing_speed: Optional[float] = None

class TypingResultGuest(BaseModel):
    user_id: str = "guest"
    total_characters: int
    errors_found: int
    seconds: float
    typing_speed: float