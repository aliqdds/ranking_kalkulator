import urllib.request
import urllib.error
from html.parser import HTMLParser
from datetime import datetime, timezone
import json
import re
import time

CLASSES = [
    ("Herrer Elite", "https://rolpau.com/nbtf-ranking.asp?reg=alle&kl=MFFsenior&kj=M&funk=FF"),
    ("Damer Elite", "https://rolpau.com/nbtf-ranking.asp?reg=alle&kl=KFFsenior&kj=K&funk=FF"),
    ("Herrer Junior", "https://rolpau.com/nbtf-ranking.asp?reg=alle&kl=MFFJunior&kj=M&funk=FF"),
    ("Damer Junior", "https://rolpau.com/nbtf-ranking.asp?reg=alle&kl=KFFJunior&kj=K&funk=FF"),
    ("Gutter 15", "https://rolpau.com/nbtf-ranking.asp?reg=alle&kl=MFFYngre&kj=M&funk=FF"),
    ("Jenter 15", "https://rolpau.com/nbtf-ranking.asp?reg=alle&kl=KFFYngre&kj=K&funk=FF"),
    ("Gutter 13", "https://rolpau.com/nbtf-ranking.asp?reg=alle&kl=MFFYngre2&kj=M&funk=FF"),
    ("Jenter 13", "https://rolpau.com/nbtf-ranking.asp?reg=alle&kl=KFFYngre2&kj=K&funk=FF"),
]

OUTPUT_FILE = "ranking.json"
MAX_RETRIES = 5


class MultiTableParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tables = []
        self.in_table = False
        self.in_cell = False
        self.current_table = []
        self.current_row = []
        self.current_cell = ""

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            self.in_table = True
            self.current_table = []
        elif self.in_table and tag == "tr":
            self.current_row = []
        elif self.in_table and tag in ("td", "th"):
            self.in_cell = True
            self.current_cell = ""

    def handle_endtag(self, tag):
        if self.in_table and tag in ("td", "th") and self.in_cell:
            self.in_cell = False
            self.current_row.append(self.current_cell.strip())
        elif self.in_table and tag == "tr":
            if self.current_row:
                self.current_table.append(self.current_row)
        elif tag == "table" and self.in_table:
            self.in_table = False
            if self.current_table:
                self.tables.append(self.current_table)

    def handle_data(self, data):
        if self.in_cell:
            self.current_cell += data


def fetch_html(url):
    headers = {
        "User-Agent": "Mozilla/5.0",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "nb-NO,nb;q=0.9,en;q=0.8",
        "Referer": "https://bordtennis.no/"
    }

    request = urllib.request.Request(url, headers=headers)

    for attempt in range(MAX_RETRIES):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return response.read().decode("utf-8", errors="ignore")
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait_time = (attempt + 1) * 10
                print(f"429 Too Many Requests. Venter {wait_time} sekunder.")
                time.sleep(wait_time)
                continue
            print(f"HTTP-feil {e.code} for {url}")
            return ""
        except Exception as e:
            wait_time = (attempt + 1) * 3
            print(f"Feil: {e}. Venter {wait_time} sekunder.")
            time.sleep(wait_time)

    return ""


def normalize(text):
    return re.sub(r"\s+", " ", (text or "").strip()).lower()


def detect_columns(header):
    rank_idx = 0
    name_idx = 1
    points_idx = 2

    for i, value in enumerate(header):
        text = normalize(value)
        if "plass" in text or text == "rank":
            rank_idx = i
        elif "navn" in text or "spiller" in text:
            name_idx = i
        elif "poeng" in text or "rating" in text:
            points_idx = i

    return rank_idx, name_idx, points_idx


def parse_players(html):
    parser = MultiTableParser()
    parser.feed(html)

    if not parser.tables:
        return []

    table = max(parser.tables, key=len)
    if len(table) < 2:
        return []

    header = table[0]
    rank_idx, name_idx, points_idx = detect_columns(header)

    players = []

    for row in table[1:]:
        needed = max(rank_idx, name_idx, points_idx)
        if len(row) <= needed:
            continue

        name = row[name_idx].strip()
        if not name:
            continue

        points_raw = row[points_idx].replace(" ", "")
        try:
            points = int(re.sub(r"[^\d\-]", "", points_raw))
        except Exception:
            continue

        rank = None
        try:
            rank = int(re.sub(r"[^\d]", "", row[rank_idx]))
        except Exception:
            rank = None

        players.append({
            "rank": rank,
            "name": name,
            "points": points
        })

    if any(p["rank"] is not None for p in players):
        players.sort(key=lambda p: p["rank"] if p["rank"] is not None else 999999)
    else:
        players.sort(key=lambda p: p["points"], reverse=True)

    return players


def main():
    data = {
        "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "source": "Uoffisiell datasamling fra offentlig tilgjengelig rankingvisning",
        "classes": {}
    }

    for class_name, url in CLASSES:
        print(f"Henter {class_name}")
        html = fetch_html(url)
        if not html:
            data["classes"][class_name] = []
            continue

        players = parse_players(html)
        data["classes"][class_name] = players
        print(f"Fant {len(players)} spillere i {class_name}")
        time.sleep(3)

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"Skrev {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
