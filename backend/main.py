from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
import httpx
from urllib.parse import urlencode
from os import path
import secrets
import logging

from app.database import init_db, get_db, User, UserResult
from app.models import Text, UserAuth, UserCreate, Token, UserResponse, TypingResult, TypingResultGuest
from app.auth import verify_password, get_password_hash, create_access_token, get_current_user, require_user
from app.config import get_settings
from app.gettext import get_text_from_db

settings = get_settings()

logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(title="TypeMaster API", version="1.0.0")

origins = settings.ALLOWED_ORIGINS.split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def read_root():
    return {"status": "Backend is running successfully!"}

@app.on_event("startup")
async def startup():
    init_db()
    logger.info("Database initialized")

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.post("/auth/register")
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.username == user_data.username).first()
    if existing:
        raise HTTPException(400, "Пользователь с таким именем уже существует")
    
    if user_data.email:
        existing = db.query(User).filter(User.email == user_data.email).first()
        if existing:
            raise HTTPException(400, "Email уже используется")
    
    hashed = get_password_hash(user_data.password)
    new_user = User(
        username=user_data.username,
        email=user_data.email,
        hashed_password=hashed,
        auth_type="local"
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return {"message": "Регистрация успешна", "user_id": new_user.id}

@app.post("/auth/token", response_model=Token)
def login(user_data: UserAuth, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == user_data.username).first()
    
    if not user or not user.hashed_password or not verify_password(user_data.password, user.hashed_password):
        raise HTTPException(401, "Неверное имя пользователя или пароль")
    
    token = create_access_token(data={"sub": str(user.id)})
    return Token(access_token=token)

@app.get("/auth/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    if not current_user:
        raise HTTPException(401, "Не авторизован")
    
    max_speed = 0.0
    total_tests = 0
    if current_user.results:
        max_speed = current_user.results.max_typing_speed
        total_tests = current_user.results.total_tests
    
    return UserResponse(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email,
        auth_type=current_user.auth_type,
        max_typing_speed=max_speed,
        total_tests=total_tests
    )

@app.get("/auth/google/login")
def google_login():
    state = secrets.token_urlsafe(32)
    
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "offline",
        "prompt": "consent",
    }
    
    auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
    logger.info(f"Redirecting to Google OAuth: {auth_url[:100]}...")
    return RedirectResponse(url=auth_url)

@app.get("/auth/google/callback")
def google_callback(
    code: str = None,
    state: str = None,
    error: str = None,
    db: Session = Depends(get_db)
):
    logger.info(f"Google callback received: code={'yes' if code else 'no'}, error={error}")
    
    if error:
        raise HTTPException(400, f"Google error: {error}")
    
    if not code:
        raise HTTPException(400, "No authorization code")
    
    # Обмен кода на токен
    token_data = {
        "code": code,
        "client_id": settings.GOOGLE_CLIENT_ID,
        "client_secret": settings.GOOGLE_CLIENT_SECRET,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "grant_type": "authorization_code",
    }
    
    try:
        with httpx.Client() as client:
            token_response = client.post("https://oauth2.googleapis.com/token", data=token_data)
            logger.info(f"Token response status: {token_response.status_code}")
            
            if token_response.status_code != 200:
                raise HTTPException(400, f"Google token error: {token_response.text}")
            
            tokens = token_response.json()
            access_token = tokens.get("access_token")
            
            # Получаем информацию о пользователе
            user_response = client.get(
                "https://www.googleapis.com/oauth2/v2/userinfo",
                headers={"Authorization": f"Bearer {access_token}"}
            )
            
            if user_response.status_code != 200:
                raise HTTPException(400, "Failed to get user info")
            
            user_info = user_response.json()
            logger.info(f"Google user info received: {user_info.get('email')}")
    except Exception as e:
        logger.error(f"Google API error: {str(e)}")
        raise HTTPException(400, f"Google API error: {str(e)}")
    
    google_id = user_info.get("id")
    email = user_info.get("email")
    name = user_info.get("name", email.split("@")[0] if email else "google_user")
    
    if not google_id or not email:
        raise HTTPException(400, "Incomplete user info from Google")
    
    # Ищем или создаём пользователя
    user = db.query(User).filter(User.google_id == google_id).first()
    
    if not user:
        # Проверяем email
        existing = db.query(User).filter(User.email == email).first()
        if existing:
            raise HTTPException(400, "Email уже используется другим аккаунтом")
        
        user = User(
            username=name,
            email=email,
            google_id=google_id,
            auth_type="google"
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        logger.info(f"New Google user created: {user.id}")
    
    # Создаём JWT
    jwt_token = create_access_token(data={"sub": str(user.id)})
    
    # Редирект на фронтенд с токеном
    return RedirectResponse(url=f"{settings.FRONTEND_URL}?token={jwt_token}")

@app.get("/text/random")
async def get_text():
    return {"text": get_text_from_db()}

@app.post("/typing/submit", response_model=TypingResult)
def submit(
    data: Text,
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db)
):
    seconds = data.time / 1000
    valid_chars = max(0, len(data.text) - data.errors)
    typing_speed = round(valid_chars / seconds, 2) if seconds > 0 else 0.0
    
    record = db.query(UserResult).filter(UserResult.user_id == current_user.id).first()
    
    max_speed = typing_speed
    total_tests = 1
    
    if record:
        total_tests = record.total_tests + 1
        if typing_speed > record.max_typing_speed:
            max_speed = typing_speed
            record.max_typing_speed = max_speed
        record.total_tests = total_tests
    else:
        new_record = UserResult(
            user_id=current_user.id,
            max_typing_speed=max_speed,
            total_tests=1
        )
        db.add(new_record)
    
    db.commit()
    
    return TypingResult(
        user_id=str(current_user.id),
        characters=len(data.text),
        errors_found=data.errors,
        seconds=round(seconds, 3),
        typing_speed=typing_speed,
        max_typing_speed=max_speed
    )

@app.post("/typing/guest", response_model=TypingResultGuest)
def guest_submit(data: Text):
    seconds = data.time / 1000
    valid_chars = max(0, len(data.text) - data.errors)
    typing_speed = round(valid_chars / seconds, 2) if seconds > 0 else 0.0
    
    return TypingResultGuest(
        total_characters=len(data.text),
        errors_found=data.errors,
        seconds=round(seconds, 3),
        typing_speed=typing_speed
    )

@app.get("/typing/stats")
def stats(current_user: User = Depends(require_user), db: Session = Depends(get_db)):
    record = db.query(UserResult).filter(UserResult.user_id == current_user.id).first()
    
    if not record:
        return {
            "user_id": current_user.id,
            "max_typing_speed": 0.0,
            "total_tests": 0,
            "username": current_user.username
        }
    
    return {
        "user_id": current_user.id,
        "max_typing_speed": record.max_typing_speed,
        "total_tests": record.total_tests,
        "username": current_user.username
    }

@app.exception_handler(Exception)
def global_error(request, exc):
    logger.error(f"Error: {exc}", exc_info=True)
    return JSONResponse(status_code=500, content={"detail": "Внутренняя ошибка сервера"})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", port=8000, reload=settings.DEBUG)