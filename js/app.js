let rankingData = {
  updated_at: null,
  source: "",
  classes: {}
};

const history = [];
const MAX_HISTORY = 5;

function hentPoengEndring(diff, vant, uventet) {
  const tabell = [
    { min: 0,   max: 0,   uventetSeier: 8,  uventetTap: -7,  forventetSeier: 8, forventetTap: -7 },
    { min: 1,   max: 49,  uventetSeier: 8,  uventetTap: -8,  forventetSeier: 8, forventetTap: -6 },
    { min: 50,  max: 99,  uventetSeier: 10, uventetTap: -10, forventetSeier: 7, forventetTap: -5 },
    { min: 100, max: 149, uventetSeier: 12, uventetTap: -12, forventetSeier: 6, forventetTap: -4 },
    { min: 150, max: 199, uventetSeier: 14, uventetTap: -14, forventetSeier: 5, forventetTap: -3 },
    { min: 200, max: 299, uventetSeier: 16, uventetTap: -16, forventetSeier: 4, forventetTap: -2 },
    { min: 300, max: 399, uventetSeier: 18, uventetTap: -18, forventetSeier: 3, forventetTap: -2 },
    { min: 400, max: 599, uventetSeier: 20, uventetTap: -20, forventetSeier: 2, forventetTap: -1 },
    { min: 600, max: Number.POSITIVE_INFINITY, uventetSeier: 25, uventetTap: -25, forventetSeier: 1, forventetTap: -1 }
  ];

  const rad = tabell.find(r => diff >= r.min && diff <= r.max);
  if (!rad) return 0;

  if (vant && uventet) return rad.uventetSeier;
  if (vant && !uventet) return rad.forventetSeier;
  if (!vant && uventet) return rad.uventetTap;
  return rad.forventetTap;
}

function formatPlayer(player) {
  const rankText = player.rank ? `${player.rank}. ` : "";
  return `${rankText}${player.name} (${player.points})`;
}

function setStatus(text) {
  document.getElementById("status").textContent = text;
}

function populateClasses() {
  const klasseEl = document.getElementById("klasse");
  klasseEl.innerHTML = "";

  const names = Object.keys(rankingData.classes || {});
  if (names.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Ingen rankingdata lastet";
    klasseEl.appendChild(opt);
    return;
  }

  for (const name of names) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    klasseEl.appendChild(opt);
  }

  klasseEl.value = names[0];
  populatePlayers(names[0]);
}

function populatePlayers(className) {
  const players = rankingData.classes[className] || [];

  document.getElementById("spillerSearch").value = "";
  document.getElementById("motstanderSearch").value = "";
  document.getElementById("spillerIndex").value = "";
  document.getElementById("motstanderIndex").value = "";
  document.getElementById("spiller").value = "";
  document.getElementById("motstander").value = "";

  if (rankingData.updated_at) {
    setStatus(`Oppdatert: ${rankingData.updated_at} · spillere lastet: ${players.length}`);
  } else {
    setStatus(`Spillere lastet: ${players.length}`);
  }
}

// --- Searchable dropdown logic ---

function filterPlayers(query, className) {
  const players = rankingData.classes[className] || [];
  if (!query) return players.slice(0, 30);
  const lower = query.toLowerCase();
  return players.filter(p => p.name.toLowerCase().includes(lower)).slice(0, 30);
}

function renderDropdown(dropdownEl, matches, onSelect) {
  dropdownEl.innerHTML = "";
  if (matches.length === 0) {
    dropdownEl.classList.remove("open");
    return;
  }

  for (const player of matches) {
    const div = document.createElement("div");
    div.className = "search-item";
    div.textContent = formatPlayer(player);
    div.addEventListener("mousedown", (e) => {
      e.preventDefault();
      onSelect(player);
    });
    dropdownEl.appendChild(div);
  }
  dropdownEl.classList.add("open");
}

function setupSearch(searchId, dropdownId, hiddenId, pointsId) {
  const searchEl = document.getElementById(searchId);
  const dropdownEl = document.getElementById(dropdownId);
  const hiddenEl = document.getElementById(hiddenId);
  const pointsEl = document.getElementById(pointsId);

  function onSelect(player) {
    searchEl.value = formatPlayer(player);
    hiddenEl.value = player.points;
    pointsEl.value = player.points;
    dropdownEl.classList.remove("open");
  }

  searchEl.addEventListener("input", () => {
    const className = document.getElementById("klasse").value;
    const matches = filterPlayers(searchEl.value, className);
    renderDropdown(dropdownEl, matches, onSelect);
    hiddenEl.value = "";
  });

  searchEl.addEventListener("focus", () => {
    const className = document.getElementById("klasse").value;
    const matches = filterPlayers(searchEl.value, className);
    renderDropdown(dropdownEl, matches, onSelect);
  });

  searchEl.addEventListener("blur", () => {
    setTimeout(() => dropdownEl.classList.remove("open"), 150);
  });
}

// --- Calculation ---

function beregnUtfall(spiller, motstander, vant, vekting) {
  const diff = Math.abs(spiller - motstander);
  let uventet;
  if (vant) {
    uventet = spiller < motstander;
  } else {
    uventet = spiller > motstander;
  }
  const grunnendring = hentPoengEndring(diff, vant, uventet);
  const totalEndring = grunnendring * vekting;
  const nyRanking = spiller + totalEndring;
  return { diff, uventet, grunnendring, totalEndring, nyRanking };
}

function getPlayerLabel(searchId, points) {
  const search = document.getElementById(searchId).value;
  if (search && search !== "") {
    const nameOnly = search.replace(/\s*\(.*\)\s*$/, "").replace(/^\d+\.\s*/, "");
    if (nameOnly) return nameOnly;
  }
  return `${points}p`;
}

function fmt(n) {
  return (n > 0 ? "+" : "") + n;
}

function beregn() {
  const spiller = Number.parseInt(document.getElementById("spiller").value, 10);
  const motstander = Number.parseInt(document.getElementById("motstander").value, 10);
  const vekting = Number.parseFloat(document.getElementById("turnering").value);
  const output = document.getElementById("output");

  if (!Number.isInteger(spiller) || !Number.isInteger(motstander)) {
    output.textContent = "Velg spillere fra listen eller skriv inn gyldige poeng.";
    output.className = "result";
    return;
  }

  if (spiller < 0 || spiller > 5000 || motstander < 0 || motstander > 5000) {
    output.textContent = "Poeng må være mellom 0 og 5000.";
    output.className = "result";
    return;
  }

  const spillerNavn = getPlayerLabel("spillerSearch", spiller);
  const motstanderNavn = getPlayerLabel("motstanderSearch", motstander);

  // Spiller vinner
  const sVinner = beregnUtfall(spiller, motstander, true, vekting);
  // Motstander taper (speilbilde)
  const mTaper = beregnUtfall(motstander, spiller, false, vekting);

  // Motstander vinner
  const mVinner = beregnUtfall(motstander, spiller, true, vekting);
  // Spiller taper
  const sTaper = beregnUtfall(spiller, motstander, false, vekting);

  output.innerHTML = `
    <div class="result-meta" style="margin-top:0; margin-bottom:10px">
      Differanse: ${sVinner.diff} · Vekting: x${vekting}
    </div>
    <table class="result-table">
      <thead>
        <tr>
          <th>Utfall</th>
          <th>${spillerNavn}<br><span class="th-points">${spiller}p</span></th>
          <th>${motstanderNavn}<br><span class="th-points">${motstander}p</span></th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="outcome-label">${spillerNavn} vinner</td>
          <td class="cell-positive">${fmt(sVinner.totalEndring)} → ${sVinner.nyRanking}</td>
          <td class="cell-negative">${fmt(mTaper.totalEndring)} → ${mTaper.nyRanking}</td>
        </tr>
        <tr>
          <td class="outcome-label">${motstanderNavn} vinner</td>
          <td class="cell-negative">${fmt(sTaper.totalEndring)} → ${sTaper.nyRanking}</td>
          <td class="cell-positive">${fmt(mVinner.totalEndring)} → ${mVinner.nyRanking}</td>
        </tr>
      </tbody>
    </table>
  `;
  output.className = "result result--filled";

  history.unshift({
    spiller: `${spillerNavn} (${spiller})`,
    motstander: `${motstanderNavn} (${motstander})`,
    sVinner: sVinner.totalEndring,
    sTaper: sTaper.totalEndring,
    mVinner: mVinner.totalEndring,
    mTaper: mTaper.totalEndring
  });
  if (history.length > MAX_HISTORY) history.pop();
  renderHistory();
}

function renderHistory() {
  const el = document.getElementById("historikk");
  if (history.length === 0) {
    el.innerHTML = "";
    return;
  }

  let html = '<h3>Siste beregninger</h3><ul class="history-list">';
  for (const h of history) {
    html += `<li>
      <span class="history-players">${h.spiller} vs ${h.motstander}</span>
      <span class="history-results">
        <span class="tag tag--positive">${fmt(h.sVinner)}</span>
        <span class="tag tag--negative">${fmt(h.sTaper)}</span>
      </span>
    </li>`;
  }
  html += "</ul>";
  el.innerHTML = html;
}

// --- Init ---

async function loadRanking() {
  document.querySelector(".container").classList.add("loading");
  try {
    const response = await fetch(`ranking.json?ts=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    rankingData = await response.json();
    populateClasses();
  } catch (error) {
    console.error(error);
    setStatus("Kunne ikke laste ranking.json. Du kan fortsatt skrive inn poeng manuelt.");
  } finally {
    document.querySelector(".container").classList.remove("loading");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("beregnBtn").addEventListener("click", beregn);

  document.getElementById("klasse").addEventListener("change", (e) => {
    populatePlayers(e.target.value);
  });

  setupSearch("spillerSearch", "spillerDropdown", "spillerIndex", "spiller");
  setupSearch("motstanderSearch", "motstanderDropdown", "motstanderIndex", "motstander");

  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.tagName !== "SELECT") {
      beregn();
    }
  });

  loadRanking();
});
