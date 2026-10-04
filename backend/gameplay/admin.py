from django.contrib import admin

from .models import DailySong, GuessAttempt, PlayerStats, ScoreEntry, Stem


class StemInline(admin.TabularInline):
    model = Stem
    extra = 4
    min_num = 4
    max_num = 4

    def get_formset(self, request, obj=None, **kwargs):
        # InlineModelAdmin.get_formset() never reads validate_min/
        # validate_max as class attributes — those only exist on
        # inlineformset_factory itself. Without passing them through
        # kwargs here, min_num/max_num only affect how many blank forms
        # render; they don't actually reject a submission with too few
        # or too many stems (confirmed empirically: a 3-stem submission
        # saved successfully until this fix was added).
        kwargs["validate_min"] = True
        kwargs["validate_max"] = True
        return super().get_formset(request, obj, **kwargs)


@admin.register(DailySong)
class DailySongAdmin(admin.ModelAdmin):
    list_display = ("date", "song", "state")
    list_filter = ("state",)
    date_hierarchy = "date"
    inlines = [StemInline]


# ---------- Who played ----------
# Everything the game saves can be looked at here, searched and, when needed, deleted (an offensive score, test data).
# None of it is added or edited by hand: attempts, scores and stats are what the server validated and calculated.


def _owner(obj) -> str:
    """Whose it is: the account's email, or "anónimo" with the start of the device id (enough to tell devices apart)."""
    if obj.user_id:
        return obj.user.email or obj.user.get_username()
    return f"anónimo ({obj.device_id[:8]}…)"


class ReadOnlyGameAdmin(admin.ModelAdmin):
    list_per_page = 50

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(GuessAttempt)
class GuessAttemptAdmin(ReadOnlyGameAdmin):
    list_display = ("created_at", "day", "attempt_number", "guessed_text", "is_correct", "owner")
    list_filter = ("is_correct",)
    date_hierarchy = "created_at"
    search_fields = ("guessed_text", "user__email", "device_id")
    list_select_related = ("user", "daily_song")

    @admin.display(description="Día", ordering="daily_song__date")
    def day(self, obj):
        return obj.daily_song.date

    @admin.display(description="De quién")
    def owner(self, obj):
        return _owner(obj)


@admin.register(ScoreEntry)
class ScoreEntryAdmin(ReadOnlyGameAdmin):
    list_display = ("created_at", "day", "display_name", "score", "winning_attempt", "total_time_seconds", "owner")
    date_hierarchy = "created_at"
    search_fields = ("display_name", "user__email", "device_id")
    list_select_related = ("user", "daily_song")

    @admin.display(description="Día", ordering="daily_song__date")
    def day(self, obj):
        return obj.daily_song.date

    @admin.display(description="De quién")
    def owner(self, obj):
        return _owner(obj)


@admin.register(PlayerStats)
class PlayerStatsAdmin(admin.ModelAdmin):
    """Each player's stats, as the server calculated them. Only the public name can be changed (to clear an offensive
    one, which frees it); the numbers are recalculated from the attempts and cannot be edited."""

    list_display = ("public_name", "owner", "played", "won", "current_streak", "max_streak", "total_score", "last_played_day", "updated_at")
    search_fields = ("public_name", "user__email", "device_id")
    ordering = ("-total_score",)
    list_per_page = 50
    list_select_related = ("user",)
    fields = ("public_name", "user", "device_id", "played", "won", "current_streak", "max_streak", "total_score", "distribution", "last_played_day", "updated_at")
    readonly_fields = tuple(f for f in fields if f != "public_name")

    @admin.display(description="De quién")
    def owner(self, obj):
        return _owner(obj)

    def has_add_permission(self, request):
        return False

    def save_model(self, request, obj, form, change):
        if not obj.public_name:
            obj.public_name = None  # an empty name must be "no name" (the unique constraint only looks at real names)
        super().save_model(request, obj, form, change)
