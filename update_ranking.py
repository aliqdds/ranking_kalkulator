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


def decode_html(raw_bytes, headers):
    content_type = headers.get("Content-Type", "")
    match = re.search(r"charset=([^\s;]+)", content_type, re.IGNORECASE)
    encodings = []

    if match:
        encodings.append(match.group(1).strip("\"'"))

    encodings.extend(["utf-8", "cp1252", "iso-8859-1"])

    for encoding in encodings:
        try:
            return raw_bytes.decode(encoding)
        except Exception:
            pass

    return raw_bytes.decode("utf-8", errors="replace")


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
                raw = response.read()
                return decode_html(raw, response.headers)

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


def to_int(value):
    text = str(value).strip().replace(" ", "")
    text = re.sub(r"[^\d\-]", "", text)
    if not text or text == "-":
        return None
    try:
        return int(text)
    except Exception:
        return None


def looks_like_name(text):
    text = (text or "").strip()
    if not text:
        return False
    if any(ch.isalpha() for ch in text):
        return True
    return False


def score_table(table):
    """
    Velg tabellen som mest sannsynlig er rankingtabellen.
    """
    score = 0

    for row in table[:5]:
        joined = " ".join(row).lower()
        if "navn" in joined or "spiller" in joined:
            score += 20
        if "poeng" in joined or "rating" in joined:
            score += 20
        if "plass" in joined or "rank" in joined:
            score += 10

    score += min(len(table), 50)

    return score


def choose_best_table(tables):
    if not tables:
        return []
    return max(tables, key=score_table)


def detect_columns(header, sample_rows):
    rank_idx = None
    name_idx = None
    points_idx = None

    for i, value in enumerate(header):
        text = normalize(value)

        if rank_idx is None and ("plass" in text or text == "rank" or text == "#"):
            rank_idx = i

        if name_idx is None and ("navn" in text or "spiller" in text):
            name_idx = i

        if points_idx is None and ("poeng" in text or "rating" in text):
            points_idx = i

    # Fallback: finn kolonnen som ser ut som navn
    if name_idx is None:
        for i in range(max(len(r) for r in sample_rows if r)):
            names = 0
            checked = 0
            for row in sample_rows[:10]:
                if i < len(row):
                    checked += 1
                    if looks_like_name(row[i]):
                        names += 1
            if checked and names >= max(3, checked // 2):
                name_idx = i
                break

    # Fallback: finn kolonnen som ser ut som rankingpoeng
    # Rankingpoeng er normalt positive og ofte mye større enn f.eks. -72.
    if points_idx is None:
        best_idx = None
        best_score = -1

        max_cols = max(len(r) for r in sample_rows if r)
        for i in range(max_cols):
            values = []
            for row in sample_rows[:20]:
                if i < len(row):
                    num = to_int(row[i])
                    if num is not None:
                        values.append(num)

            if not values:
                continue

            positives = sum(1 for v in values if v >= 0)
            large_values = sum(1 for v in values if v >= 100)
            negatives = sum(1 for v in values if v < 0)

            score = positives * 2 + large_values * 3 - negatives * 3

            if score > best_score:
                best_score = score
                best_idx = i

        points_idx = best_idx

    # Fallback rank
    if rank_idx is None:
        rank_idx = 0

    if name_idx is None:
        name_idx = 1

    if points_idx is None:
        points_idx = 2

    return rank_idx, name_idx, points_idx


def parse_players(html, class_name="ukjent"):
    parser = MultiTableParser()
    parser.feed(html)

    if not parser.tables:
        print(f"[{class_name}] Fant ingen tabeller.")
        return []

    table = choose_best_table(parser.tables)
    if len(table) < 2:
        print(f"[{class_name}] Fant ingen gyldig rankingtabell.")
        return []

    header = table[0]
    sample_rows = table[1: min(len(table), 15)]
    rank_idx, name_idx, points_idx = detect_columns(header, sample_rows)

    print(f"[{class_name}] Header: {header}")
    print(f"[{class_name}] Kolonner valgt -> rank={rank_idx}, navn={name_idx}, poeng={points_idx}")

    players = []

    for row in table[1:]:
        needed = max(rank_idx, name_idx, points_idx)
        if len(row) <= needed:
            continue

        name = row[name_idx].strip()
        if not looks_like_name(name):
            continue

        points = to_int(row[points_idx])
        if points is None:
            continue

        # Filtrer bort åpenbart feil kolonnevalg som -72 osv.
        if points < 0:
            continue

        rank = to_int(row[rank_idx])

        players.append({
            "rank": rank,
            "name": name,
            "points": points
        })

    # Hvis vi fortsatt fikk rare resultater, prøv å finne en bedre poengkolonne
    if players and all(p["points"] == players[0]["points"] for p in players[:min(10, len(players))]):
        print(f"[{class_name}] Advarsel: mange like poeng. Sjekk kolonnevalg i Actions-loggen.")

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

        players = parse_players(html, class_name)
        data["classes"][class_name] = players
        print(f"Fant {len(players)} spillere i {class_name}")
        time.sleep(3)

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"Skrev {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
