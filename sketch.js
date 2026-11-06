const W = 975, H = 680;
const MAP_TOP = 60;   // space above the map for the title

const DISTRICTS_FILE = "data/districts.csv";
const STATES_FILE = "data/states.csv";

const TIGER = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Legislative/MapServer";
const LAYER_MATCH = /119th Congressional Districts/i;
const SIMPLIFY_DEG = 0.02;   

// how hard the borders shake
const AMP  = [0.4, 9];       // pixels of drift
const FREQ = [0.004, 0.07];  // how jittery that drift is
const SPEED = [0.002, 0.03]; // how fast it changes over time

// sound
const VOL    = [0.02, 0.55];
const CUTOFF = [250, 9000];  // low-pass cutoff in Hz

let districts = [];          
let stateSpend = new Map();  
let stateS = new Map();      
let status = "loading district boundaries…";
let demo = false;
let byState = false;  
let hoverFips = null;
let noiseSrc, filter, audioOn = false;
let volSlider, muteBtn, muted = false;
const DEFAULT_VOLUME = 0.5;   



function setup() {
  createCanvas(W, H).parent("sketch");
  frameRate(30);
  buildControls();
  textFont("IBM Plex Mono, Menlo, monospace");
  loadEverything();
}

async function loadEverything() {
  try {
    const feats = await fetchDistricts();
    const proj = d3.geoAlbersUsa().scale(1300).translate([W / 2, MAP_TOP + 305]);
    for (const f of feats) {
      if (!f.geometry || !f.geometry.rings) continue;
      const geoid = String(f.attributes.GEOID);
      const rings = [];
      for (const ring of f.geometry.rings) {
        const pts = [];
        for (const [lon, lat] of ring) {
          const p = proj([lon, lat]);
          if (p) pts.push(p);
        }
        if (pts.length > 2) rings.push(pts);
      }
      if (!rings.length) continue;   // territories fall outside AlbersUsa
      districts.push({ geoid, fips: geoid.slice(0, 2), rings, bbox: bbox(rings), s: 0 });
    }
  } catch (e) {
    status = "Couldn't load boundaries from TIGERweb: " + e.message;
    console.error(e);
    return;
  }

  status = "loading spend…";
  const dist = await loadCSV(DISTRICTS_FILE);
  const st = await loadCSV(STATES_FILE);

  byState = !dist && !!st;
  const dSpend = new Map();
  if (dist) {
    for (const r of dist) dSpend.set(r.geoid.padStart(4, "0"), +r.spend_usd || 0);
  } else if (!st) {
    demo = true;   // if all else fails, a demo will show
    for (const d of districts) dSpend.set(d.geoid, 1e3 * pow(10, 4 * noise(+d.geoid * 0.37)));
  }

  if (st) {
    for (const r of st) stateSpend.set(r.state_fips.padStart(2, "0"), +r.spend_usd || 0);
  } else {
    for (const d of districts)
      stateSpend.set(d.fips, (stateSpend.get(d.fips) || 0) + (dSpend.get(d.geoid) || 0));
  }

  // log scale 
  const sScale = logScaler([...stateSpend.values()]);
  for (const [f, v] of stateSpend) stateS.set(f, sScale(v));
  if (byState) {
    for (const d of districts) d.s = stateS.get(d.fips) || 0;
  } else {
    const dScale = logScaler(districts.map(d => dSpend.get(d.geoid) || 0));
    for (const d of districts) d.s = dScale(dSpend.get(d.geoid) || 0);
  }

  status = null;
}

async function fetchDistricts() {
  // find the 119th CD layer by name instead of hard-coding its id
  const svc = await (await fetch(`${TIGER}?f=json`)).json();
  const layer = (svc.layers || []).find(l => LAYER_MATCH.test(l.name));
  if (!layer) throw new Error("No 119th Congressional Districts layer found");

  const out = [];
  let offset = 0;
  while (true) {
    const q = new URLSearchParams({
      where: "1=1", outFields: "GEOID", returnGeometry: "true",
      outSR: "4326", maxAllowableOffset: SIMPLIFY_DEG, geometryPrecision: "3",
      resultOffset: offset, resultRecordCount: 200, f: "json",
    });
    const res = await (await fetch(`${TIGER}/${layer.id}/query?${q}`)).json();
    if (res.error) throw new Error(res.error.message);
    out.push(...res.features);
    if (!res.exceededTransferLimit || !res.features.length) break;
    offset += res.features.length;
  }
  return out;
}

async function loadCSV(path) {
  try {
    const r = await fetch(path);
    if (!r.ok) return null;
    return d3.csvParse(await r.text());
  } catch { return null; }
}

function logScaler(vals) {
  const logs = vals.map(v => Math.log10(1 + v));
  const lo = Math.min(...logs), hi = Math.max(...logs);
  return v => hi > lo ? (Math.log10(1 + v) - lo) / (hi - lo) : 0;
}

function bbox(rings) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rings) for (const [x, y] of r) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y);
    x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return [x0, y0, x1, y1];
}


function draw() {
  background(244, 242, 238);

  if (status) {
    fill(60); noStroke(); textSize(13); textAlign(CENTER, CENTER);
    text(status, W / 2, H / 2);
    return;
  }

  hoverFips = findState(mouseX, mouseY);
  const ctx = drawingContext;
  const t = frameCount;

  for (const d of districts) {
    const amp = lerp(AMP[0], AMP[1], d.s);
    const fq = lerp(FREQ[0], FREQ[1], d.s);
    const tt = t * lerp(SPEED[0], SPEED[1], d.s);
    const hot = d.fips === hoverFips;

    ctx.beginPath();
    for (const ring of d.rings) {
      for (let i = 0; i < ring.length; i++) {
        const [x, y] = ring[i];
        // two separate noise lookups so points drift in x and y independently
        const dx = (noise(x * fq, y * fq, tt) - 0.5) * 2 * amp;
        const dy = (noise(x * fq + 91.7, y * fq + 13.3, tt) - 0.5) * 2 * amp;
        if (i === 0) ctx.moveTo(x + dx, y + dy); else ctx.lineTo(x + dx, y + dy);
      }
      ctx.closePath();
    }
    if (hot) { ctx.fillStyle = "rgba(200, 60, 40, 0.10)"; ctx.fill("evenodd"); }
    ctx.lineWidth = hot ? 1.1 : 0.6;
    ctx.strokeStyle = hot ? "rgba(170, 40, 25, 0.9)" : `rgba(25, 25, 25, ${0.25 + 0.5 * d.s})`;
    ctx.stroke();
  }

  updateSound();
  drawLabels();
}

function drawLabels() {
  noStroke(); fill(40); textAlign(LEFT, TOP); textSize(12);
  text(byState ? "ELECTION NOISE — Google political ad spend, 2026 midterm cycle, by state"
               : "ELECTION NOISE — Google political ad spend by congressional district, since 2018", 16, 14);
  fill(110); textSize(11);
  text(demo ? "Demo substitute numbers: you need to add files to data/ " :
              "Source: Google Political Ads Transparency Report (Google + YouTube only)", 16, 32);

  textAlign(RIGHT, BOTTOM);
  if (!audioOn) {
    fill(170, 40, 25); textSize(12);
    text("click the map to listen", W - 16, H - 14);
  }
  if (hoverFips) {
    const info = STATES[hoverFips];
    const v = stateSpend.get(hoverFips) || 0;
    fill(30); textSize(14);
    text(`${info ? info[1] : hoverFips}  ${fmtUSD(v)}${demo ? " (demo)" : ""}`, W - 16, H - (audioOn ? 14 : 34));
  }
}

function fmtUSD(v) {
  if (v >= 1e9) return "$" + (v / 1e9).toFixed(1) + "B";
  if (v >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return "$" + (v / 1e3).toFixed(0) + "K";
  return "$" + Math.round(v);
}

// hit test
function findState(mx, my) {
  if (mx < 0 || my < 0 || mx > W || my > H) return null;
  for (const d of districts) {
    const [x0, y0, x1, y1] = d.bbox;
    if (mx < x0 || mx > x1 || my < y0 || my > y1) continue;
    let inside = false;   // even-odd across all rings handles holes
    for (const r of d.rings) if (pointInRing(mx, my, r)) inside = !inside;
    if (inside) return d.fips;
  }
  return null;
}

function pointInRing(x, y, r) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}

// volume controls 
function buildControls() {
  const bar = createDiv().parent("controls").class("controls");
  createSpan("volume").parent(bar);
  volSlider = createSlider(0, 1, DEFAULT_VOLUME, 0.01).parent(bar);
  volSlider.attribute("aria-label", "volume");
  volSlider.input(applyVolume);
  muteBtn = createButton("mute").parent(bar);
  muteBtn.mousePressed(() => {
    muted = !muted;
    muteBtn.html(muted ? "unmute" : "mute");
    applyVolume();
  });
}

function applyVolume() {
  if (!audioOn) return;
  // squared so the low end of the slider gives fine control over quiet levels
  const v = muted ? 0 : Math.pow(volSlider.value(), 2);
  outputVolume(v, 0.1);
}

function mousePressed() {
  if (audioOn || mouseX < 0 || mouseY < 0 || mouseX > W || mouseY > H) return;
  userStartAudio();
  filter = new p5.LowPass();
  filter.res(2);
  noiseSrc = new p5.Noise("pink");
  noiseSrc.disconnect();
  noiseSrc.connect(filter);
  noiseSrc.amp(0);
  noiseSrc.start();
  audioOn = true;
  applyVolume();
}

function updateSound() {
  if (!audioOn) return;
  if (hoverFips == null) {
    noiseSrc.amp(0, 0.25);
    return;
  }
  const s = stateS.get(hoverFips) || 0;
  noiseSrc.amp(lerp(VOL[0], VOL[1], s), 0.15);
  // exponential so the cutoff sweep sounds even to the ear
  filter.freq(CUTOFF[0] * Math.pow(CUTOFF[1] / CUTOFF[0], s), 0.15);
}


const STATES = {
  "01":["AL","Alabama"],"02":["AK","Alaska"],"04":["AZ","Arizona"],"05":["AR","Arkansas"],
  "06":["CA","California"],"08":["CO","Colorado"],"09":["CT","Connecticut"],"10":["DE","Delaware"],
  "11":["DC","District of Columbia"],"12":["FL","Florida"],"13":["GA","Georgia"],"15":["HI","Hawaii"],
  "16":["ID","Idaho"],"17":["IL","Illinois"],"18":["IN","Indiana"],"19":["IA","Iowa"],
  "20":["KS","Kansas"],"21":["KY","Kentucky"],"22":["LA","Louisiana"],"23":["ME","Maine"],
  "24":["MD","Maryland"],"25":["MA","Massachusetts"],"26":["MI","Michigan"],"27":["MN","Minnesota"],
  "28":["MS","Mississippi"],"29":["MO","Missouri"],"30":["MT","Montana"],"31":["NE","Nebraska"],
  "32":["NV","Nevada"],"33":["NH","New Hampshire"],"34":["NJ","New Jersey"],"35":["NM","New Mexico"],
  "36":["NY","New York"],"37":["NC","North Carolina"],"38":["ND","North Dakota"],"39":["OH","Ohio"],
  "40":["OK","Oklahoma"],"41":["OR","Oregon"],"42":["PA","Pennsylvania"],"44":["RI","Rhode Island"],
  "45":["SC","South Carolina"],"46":["SD","South Dakota"],"47":["TN","Tennessee"],"48":["TX","Texas"],
  "49":["UT","Utah"],"50":["VT","Vermont"],"51":["VA","Virginia"],"53":["WA","Washington"],
  "54":["WV","West Virginia"],"55":["WI","Wisconsin"],"56":["WY","Wyoming"],
};
