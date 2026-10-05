import secrets

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.db.models.functions import Lower

# Uppercase letters and digits without the look-alikes (I, L, O, 0, 1): the code is read aloud and typed on a phone.
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def new_code():
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))


def new_host_token():
    return secrets.token_urlsafe(24)


class Battle(models.Model):
    LOBBY, PLAYING, FINISHED = "lobby", "playing", "finished"
    STATUS_CHOICES = [(LOBBY, "En espera"), (PLAYING, "Jugando"), (FINISHED, "Terminada")]
    # Where the music plays: on every player's device, or only on the organizer's (who then acts as the host).
    EACH, HOST = "each", "host"
    AUDIO_MODES = [(EACH, "En cada dispositivo"), (HOST, "En el dispositivo del anfitrión")]
    # Who may come in: anybody with the link, or only whom the organizer accepts.
    OPEN, APPROVAL = "open", "approval"
    JOIN_MODES = [(OPEN, "Cualquiera con el enlace"), (APPROVAL, "Con aprobación")]

    code = models.CharField(max_length=8, unique=True, default=new_code)
    # A capability: whoever holds it organizes the battle (kept on the host's device). Compared in constant time.
    host_token = models.CharField(max_length=64, default=new_host_token)
    host_user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="hosted_battles")
    host_device_id = models.CharField(max_length=64, blank=True)
    title = models.CharField(max_length=60, blank=True)
    audio_mode = models.CharField(max_length=10, choices=AUDIO_MODES, default=EACH)
    join_mode = models.CharField(max_length=10, choices=JOIN_MODES, default=OPEN)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=LOBBY, db_index=True)
    round_count = models.PositiveSmallIntegerField()
    round_seconds = models.PositiveSmallIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    # Goes up with every change a polling device cares about (someone joins, answers, the battle starts or ends).
    version = models.PositiveIntegerField(default=1)

    def __str__(self):
        return f"Batalla {self.code}"


class BattleRound(models.Model):
    battle = models.ForeignKey(Battle, on_delete=models.CASCADE, related_name="rounds")
    index = models.PositiveSmallIntegerField()  # 0-based
    song = models.ForeignKey("catalog.Song", on_delete=models.PROTECT, related_name="+")
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()

    class Meta:
        ordering = ["index"]
        constraints = [models.UniqueConstraint(fields=["battle", "index"], name="battle_round_index_unique")]


class BattlePlayer(models.Model):
    ACCEPTED, PENDING, REJECTED = "accepted", "pending", "rejected"
    STATUS_CHOICES = [(ACCEPTED, "Aceptado"), (PENDING, "Esperando"), (REJECTED, "Rechazado")]

    battle = models.ForeignKey(Battle, on_delete=models.CASCADE, related_name="players")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="battle_players")
    device_id = models.CharField(max_length=64, blank=True)
    display_name = models.CharField(max_length=50)
    # Only the accepted play, rank and count; the waiting and the rejected keep their name reserved in the room.
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=ACCEPTED)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["joined_at", "id"]
        constraints = [
            models.UniqueConstraint(Lower("display_name"), "battle", name="battle_player_name_unique"),
            models.UniqueConstraint(fields=["battle", "user"], condition=Q(user__isnull=False), name="battle_player_user_unique"),
            models.UniqueConstraint(
                fields=["battle", "device_id"], condition=Q(user__isnull=True) & ~Q(device_id=""), name="battle_player_device_unique"
            ),
        ]


class BattleAnswer(models.Model):
    round = models.ForeignKey(BattleRound, on_delete=models.CASCADE, related_name="answers")
    player = models.ForeignKey(BattlePlayer, on_delete=models.CASCADE, related_name="answers")
    song_guessed = models.ForeignKey("catalog.Song", null=True, on_delete=models.SET_NULL, related_name="+")
    correct = models.BooleanField()
    received_at = models.DateTimeField()  # the server's clock, never the device's
    points = models.PositiveSmallIntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["round", "player"], name="battle_answer_once")]
