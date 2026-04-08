let rankingData = {
  updated_at: null,
  source: "",
  classes: {}
};

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
  const spillerSel = document.getElementById("spillerSelect");
  const motstanderSel = document.getElementById("motstanderSelect");

  spillerSel.innerHTML = "";
  motstanderSel.innerHTML = "";

  const placeholder1 = document.createElement("option");
  placeholder1.value = "";
  placeholder1.textContent = "— velg fra liste —";
  spillerSel.appendChild(placeholder1);

  const placeholder2 = document.createElement("option");
  placeholder2.value = "";
  placeholder2.textContent = "— velg fra liste —";
  motstanderSel.appendChild(placeholder2);

  players.forEach((player, index) => {
    const opt1 = document.createElement("option");
    opt1.value = String(index);
    opt1.textContent = formatPlayer(player);
    spillerSel.appendChild(opt1);

    const opt2 = document.createElement("option");
    opt2.value = String(index);
    opt2.textContent = formatPlayer(player);
    motstanderSel.appendChild(opt2);
  });

  if (rankingData.updated_at) {
    setStatus(`Oppdatert: ${rankingData.updated_at} · spillere lastet: ${players.length}`);
  } else {
    setStatus(`Spillere lastet: ${players.length}`);
  }
}

function syncPointsFromSelect(inputId, selectId, className) {
  const input = document.getElementById(inputId);
  const select = document.getElementById(selectId);
  const players = rankingData.classes[className] || [];

  if (select.value === "") return;

  const index = Number.parseInt(select.value, 10);
  if (Number.isInteger(index) && players[index]) {
    input.value = players[index].points;
  }
}

function beregn() {
  const className = document.getElementById("klasse").value;
  const spiller = Number.parseInt(document.getElementById("spiller").value, 10);
  const motstander = Number.parseInt(document.getElementById("motstander").value, 10);
  const vekting = Number.parseFloat(document.getElementById("turnering").value);
  const vant = document.getElementById("resultat").value === "vant";
  const output = document.getElementById("output");

  if (!Number.isInteger(spiller) || !Number.isInteger(motstander)) {
    output.textContent = "Velg spillere fra listen eller skriv inn gyldige poeng.";
    return;
  }

  const diff = Math.abs(spiller - motstander);

  let uventet = false;
  if (vant) {
    uventet = spiller < motstander;
  } else {
    uventet = spiller > motstander;
  }

  const grunnendring = hentPoengEndring(diff, vant, uventet);
  const totalEndring = grunnendring * vekting;
  const nyRanking = spiller + totalEndring;

  output.innerHTML = `
    <strong>Poengdifferanse:</strong> ${diff}<br>
    <strong>Resultat:</strong> ${uventet ? "Uventet" : "Forventet"}<br>
    <strong>Grunnendring:</strong> ${grunnendring}<br>
    <strong>Turneringsvekting:</strong> x${vekting}<br>
    <strong>Total endring:</strong> ${totalEndring}<br>
    <strong>Ny ranking:</strong> ${nyRanking}
  `;
}

async function loadRanking() {
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
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("beregnBtn").addEventListener("click", beregn);

  document.getElementById("klasse").addEventListener("change", (e) => {
    populatePlayers(e.target.value);
  });

  document.getElementById("spillerSelect").addEventListener("change", () => {
    const className = document.getElementById("klasse").value;
    syncPointsFromSelect("spiller", "spillerSelect", className);
  });

  document.getElementById("motstanderSelect").addEventListener("change", () => {
    const className = document.getElementById("klasse").value;
    syncPointsFromSelect("motstander", "motstanderSelect", className);
  });

  loadRanking();
});
