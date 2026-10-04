from accounts.models import AuthToken

from .conftest import PASSWORD, auth_header

LOGIN = "/api/auth/login/"
LOGOUT = "/api/auth/logout/"
WRONG = {"detail": "Correo o contraseña incorrectos."}


def login(api, email="ana@example.com", password=PASSWORD):
    return api.post(LOGIN, {"email": email, "password": password}, format="json")


def test_login_returns_a_working_session_token(api, make_user):
    make_user("ana@example.com")

    response = login(api)

    assert response.status_code == 200
    assert api.get("/api/me/", **auth_header(response.data["token"])).status_code == 200


def test_login_ignores_case_and_surrounding_spaces_in_the_email(api, make_user):
    make_user("ana@example.com")

    assert login(api, email="  ANA@Example.com ").status_code == 200


def test_a_wrong_password_and_an_unknown_email_get_the_same_answer(api, make_user):
    make_user("ana@example.com")

    wrong_password = login(api, password="otra-clave-larga-2")
    unknown_email = login(api, email="nadie@example.com")

    assert wrong_password.status_code == unknown_email.status_code == 400
    assert wrong_password.data == unknown_email.data == WRONG
    assert AuthToken.objects.count() == 0


def test_an_unconfirmed_account_with_the_right_password_is_told_to_confirm(api, make_user):
    make_user("ana@example.com", confirmed=False)

    response = login(api)

    assert response.status_code == 403
    assert response.data == {"detail": "Confirmá tu correo antes de entrar.", "code": "email_not_confirmed"}
    assert AuthToken.objects.count() == 0


def test_an_unconfirmed_account_with_the_wrong_password_is_not_told_anything_special(api, make_user):
    make_user("ana@example.com", confirmed=False)

    response = login(api, password="otra-clave-larga-2")

    assert response.status_code == 400
    assert response.data == WRONG


def test_a_blocked_account_gets_the_generic_answer_even_with_the_right_password(api, make_user):
    make_user("ana@example.com", active=False)

    response = login(api)

    assert response.status_code == 400
    assert response.data == WRONG
    assert AuthToken.objects.count() == 0


def test_each_login_creates_its_own_session(api, make_user):
    make_user("ana@example.com")

    first, second = login(api).data["token"], login(api).data["token"]

    assert first != second
    assert AuthToken.objects.count() == 2


def test_logout_deletes_only_the_token_used(api, make_user):
    user = make_user("ana@example.com")
    first, second = AuthToken.issue(user), AuthToken.issue(user)

    response = api.post(LOGOUT, **auth_header(first))

    assert response.status_code == 204
    assert api.get("/api/me/", **auth_header(first)).status_code == 401
    assert api.get("/api/me/", **auth_header(second)).status_code == 200


def test_logout_without_a_token_is_a_401(api, db):
    assert api.post(LOGOUT).status_code == 401


def test_login_with_missing_fields_is_a_400(api, db):
    assert api.post(LOGIN, {}, format="json").status_code == 400
