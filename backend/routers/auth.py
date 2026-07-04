import json

from fastapi import APIRouter, Depends, HTTPException, Response, status

from auth import create_access_token, get_current_user, hash_password, verify_password
from database import get_connection
from schemas import OCCUPATIONS, EMPLOYMENT_TYPES, LoginRequest, SignupRequest, UserResponse

router = APIRouter(prefix="/auth", tags=["auth"])

_COOKIE_OPTS = dict(httponly=True, samesite="lax", secure=False, max_age=72 * 3600)


@router.get("/occupations")
def list_occupations():
    return {"occupations": OCCUPATIONS, "employmentTypes": EMPLOYMENT_TYPES}


@router.post("/signup", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def signup(req: SignupRequest, response: Response):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE email = %s", (req.email,))
            if cur.fetchone():
                raise HTTPException(status_code=409, detail="Email already registered")

            cur.execute(
                """
                INSERT INTO users
                    (email, hashed_password, first_name, last_name,
                     city, state, zip_code, occupation, employment_type, custom_info)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id, email, first_name, last_name, city, state, zip_code,
                          occupation, employment_type, custom_info, created_at
                """,
                (
                    req.email,
                    hash_password(req.password),
                    req.firstName,
                    req.lastName,
                    req.city,
                    req.state,
                    req.zipCode,
                    req.occupation,
                    req.employmentType,
                    json.dumps(req.customInfo),
                ),
            )
            user = dict(cur.fetchone())
        conn.commit()

    token = create_access_token(str(user["id"]))
    response.set_cookie(key="access_token", value=token, **_COOKIE_OPTS)
    return _to_response(user)


@router.post("/login", response_model=UserResponse)
def login(req: LoginRequest, response: Response):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, email, hashed_password, first_name, last_name, city, state, "
                "zip_code, occupation, employment_type, custom_info, created_at "
                "FROM users WHERE email = %s",
                (req.email,),
            )
            user = cur.fetchone()

    if not user or not verify_password(req.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token(str(user["id"]))
    response.set_cookie(key="access_token", value=token, **_COOKIE_OPTS)
    return _to_response(dict(user))


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie("access_token")
    return {"message": "Logged out"}


@router.get("/me", response_model=UserResponse)
def me(user: dict = Depends(get_current_user)):
    return _to_response(user)


def _to_response(user: dict) -> UserResponse:
    ci = user.get("custom_info") or {}
    if isinstance(ci, str):
        ci = json.loads(ci)
    return UserResponse(
        id=str(user["id"]),
        email=user["email"],
        firstName=user.get("first_name"),
        lastName=user.get("last_name"),
        city=user.get("city"),
        state=user.get("state"),
        zipCode=user.get("zip_code"),
        occupation=user.get("occupation"),
        employmentType=user.get("employment_type"),
        customInfo=ci,
        createdAt=str(user["created_at"]),
    )
