"""Creating an account needs the person to accept the Terms and the Privacy policy, and lets them choose, separately and
off by default, whether they want news by email. What they accepted, when and which version is recorded (on their
profile, once they confirm their email) and they can change the news choice afterwards."""

import re

import pytest
from accounts.models import EmailChallenge, Profile
from accounts.users import is_confirmed
from django.contrib.auth import get_user_model
from django.utils import timezone

from .conftest import PASSWORD, auth_header

User = get_user_model()
REGISTER = "/api/auth/register/"
CONFIRM = "/api/auth/confirm/"
MAGIC_REQUEST = "/api/auth/magic/request/"
MAGIC_VERIFY = "/api/auth/magic/verify/"
ME = "/api/me/"


def token_from(mail):
    return re.search(r"#token=([\w-]+)", mail.body).group(1)


def register(api, **extra):
    body = {"email": "ana@example.com", "password": PASSWORD, "accepts_terms": True, **extra}
    return api.post(REGISTER, body, format="json")


def confirm(api, mail):
    return api.post(CONFIRM, {"token": token_from(mail)}, format="json")


class TestTheTermsAreRequiredToRegister:
    @pytest.mark.parametrize("value", [False, None, "yes", 0])
    def test_without_accepting_them_nothing_happens(self, api, db, mailoutbox, value):
        response = register(api, accepts_terms=value)

        assert response.status_code == 400
        assert "Términos" in str(response.data)
        assert not User.objects.exists() and mailoutbox == []

    def test_leaving_the_field_out_is_the_same_as_not_accepting(self, api, db, mailoutbox):
        response = api.post(REGISTER, {"email": "ana@example.com", "password": PASSWORD}, format="json")

        assert response.status_code == 400
        assert not User.objects.exists() and mailoutbox == []

    def test_accepting_them_registers_as_usual(self, api, db, mailoutbox):
        assert register(api).status_code == 202
        assert len(mailoutbox) == 1

    def test_the_answer_does_not_depend_on_whether_the_email_already_has_an_account(self, api, make_user, mailoutbox):
        make_user("ana@example.com")

        assert register(api, accepts_terms=False).status_code == 400  # same refusal as for a new address
        assert register(api).status_code == 202


class TestWhatTheyAcceptedIsRecordedWhenTheyConfirm:
    def test_the_terms_acceptance_gets_a_date_and_the_version_of_the_texts(self, api, db, mailoutbox, settings):
        settings.TERMS_VERSION = "2026-10"
        register(api)
        confirm(api, mailoutbox[0])

        profile = Profile.objects.get(user__username="ana@example.com")
        assert profile.terms_accepted_at is not None
        assert abs((timezone.now() - profile.terms_accepted_at).total_seconds()) < 60
        assert profile.terms_version == "2026-10"

    def test_the_news_are_off_unless_the_person_ticked_them(self, api, db, mailoutbox):
        register(api)
        confirm(api, mailoutbox[0])

        profile = Profile.objects.get(user__username="ana@example.com")
        assert profile.news_opt_in is False and profile.news_opt_in_at is None

    def test_ticking_them_is_recorded_with_its_date(self, api, db, mailoutbox):
        register(api, accepts_news=True)
        confirm(api, mailoutbox[0])

        profile = Profile.objects.get(user__username="ana@example.com")
        assert profile.news_opt_in is True and profile.news_opt_in_at is not None

    def test_nothing_is_recorded_until_the_email_is_confirmed(self, api, db, mailoutbox):
        register(api, accepts_news=True)

        user = User.objects.get(username="ana@example.com")
        assert not is_confirmed(user)
        profile = Profile.objects.filter(user=user).first()
        assert profile is None or (profile.terms_accepted_at is None and not profile.news_opt_in)

    def test_the_choice_travels_with_the_emailed_link(self, api, db, mailoutbox):
        register(api, accepts_news=True)

        assert EmailChallenge.objects.get(purpose=EmailChallenge.CONFIRM).accepts_news is True

    def test_news_must_be_a_real_yes_or_no(self, api, db, mailoutbox):
        assert register(api, accepts_news="quizás").status_code == 400


class TestCreatingTheAccountWithAnEmailedLink:
    def test_continuing_with_the_link_records_the_terms_and_the_news_choice(self, api, db, mailoutbox):
        api.post(MAGIC_REQUEST, {"email": "nueva@example.com", "accepts_news": True}, format="json")
        api.post(MAGIC_VERIFY, {"token": token_from(mailoutbox[0])}, format="json")

        profile = Profile.objects.get(user__username="nueva@example.com")
        assert profile.terms_accepted_at is not None and profile.news_opt_in is True

    def test_without_ticking_the_news_stay_off(self, api, db, mailoutbox):
        api.post(MAGIC_REQUEST, {"email": "nueva@example.com"}, format="json")
        api.post(MAGIC_VERIFY, {"token": token_from(mailoutbox[0])}, format="json")

        assert Profile.objects.get(user__username="nueva@example.com").news_opt_in is False

    def test_an_account_that_already_exists_keeps_its_choice_whatever_a_later_link_says(self, api, make_user, mailoutbox):
        user = make_user("ana@example.com")
        Profile.objects.filter(user=user).update(news_opt_in=False, terms_accepted_at=timezone.now())

        api.post(MAGIC_REQUEST, {"email": "ana@example.com", "accepts_news": True}, format="json")
        api.post(MAGIC_VERIFY, {"token": token_from(mailoutbox[0])}, format="json")

        assert Profile.objects.get(user=user).news_opt_in is False

    def test_what_was_ticked_when_registering_is_not_lost_if_they_confirm_with_a_sign_in_link_instead(
        self, api, db, mailoutbox
    ):
        register(api, accepts_news=True)  # ticks the news, does not confirm yet
        api.post(MAGIC_REQUEST, {"email": "ana@example.com"}, format="json")  # asks for a sign-in link, news unticked
        api.post(MAGIC_VERIFY, {"token": token_from(mailoutbox[-1])}, format="json")

        assert Profile.objects.get(user__username="ana@example.com").news_opt_in is True

    def test_the_news_choice_must_be_a_real_yes_or_no_here_too(self, api, db):
        assert api.post(MAGIC_REQUEST, {"email": "a@b.co", "accepts_news": "quizás"}, format="json").status_code == 400


class TestSeeingAndChangingTheChoice:
    def logged_in(self, api, make_user):
        user = make_user("ana@example.com")
        from accounts.models import AuthToken

        return user, auth_header(AuthToken.issue(user))

    def test_me_tells_what_was_accepted(self, api, make_user):
        user, header = self.logged_in(api, make_user)
        Profile.objects.filter(user=user).update(terms_accepted_at=timezone.now(), news_opt_in=True)

        body = api.get(ME, **header).json()

        assert body["accepts_news"] is True
        assert body["terms_accepted_at"] is not None

    def test_the_news_choice_can_be_turned_on_and_off_and_each_change_is_dated(self, api, make_user):
        user, header = self.logged_in(api, make_user)

        on = api.patch(ME, {"accepts_news": True}, format="json", **header)
        assert on.status_code == 200 and on.json()["accepts_news"] is True
        first = Profile.objects.get(user=user).news_opt_in_at
        assert first is not None

        off = api.patch(ME, {"accepts_news": False}, format="json", **header)
        assert off.json()["accepts_news"] is False
        assert Profile.objects.get(user=user).news_opt_in is False

    @pytest.mark.parametrize("bad", ["sí", None, 1, [], {}])
    def test_only_a_real_yes_or_no_is_accepted(self, api, make_user, bad):
        _, header = self.logged_in(api, make_user)

        assert api.patch(ME, {"accepts_news": bad}, format="json", **header).status_code == 400

    def test_nothing_else_can_be_changed_through_it(self, api, make_user):
        user, header = self.logged_in(api, make_user)

        api.patch(ME, {"accepts_news": True, "email": "otro@example.com", "terms_accepted_at": None}, format="json", **header)

        user.refresh_from_db()
        assert user.email == "ana@example.com"

    def test_it_needs_a_session(self, api, db):
        assert api.patch(ME, {"accepts_news": True}, format="json").status_code in (401, 403)
