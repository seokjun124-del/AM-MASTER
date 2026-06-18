
// ======================== CONFIG ========================
const SHEET_ID = '13mvFbhAR_RJ95mt-HQy_lC_q9AmI0NIdEbo1XJvcZPc';
const PUBLISHED_BASE = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRvMVvK8k2eUjR9zz9ojWf8e4h_9G_N3UFIufxnWk1y-Mbb87MfAg5aSHqFx22-9UDsaJk458ihRBjq/pub';
const BWTS_GID = '695648690';
const SOX_GID = '0';

function csvUrl(gid) {
  return `${PUBLISHED_BASE}?output=csv&gid=${gid}`;
}

let BWTS = [];
let SOX = [];

// CSV 파싱 (큰따옴표 포함 처리)
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = parseLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = parseLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h.trim()] = (vals[i] || '').trim(); });
    return obj;
  });
}

function parseLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { result.push(cur); cur = ''; }
    else { cur += ch; }
  }
  result.push(cur);
  return result;
}

function isTrue(v) {
  return v === 'TRUE' || v === 'true' || v === '1' || v === 'Y' || v === 'y';
}


// 로딩 UI
function showLoading() {
  document.getElementById('loadingOverlay').style.display = 'flex';
}
function hideLoading() {
  document.getElementById('loadingOverlay').style.display = 'none';
}
function showError(msg) {
  document.getElementById('loadingOverlay').innerHTML = `
    <div style="text-align:center;color:#fff">
      <div style="font-size:32px;margin-bottom:12px">⚠️</div>
      <div style="font-size:16px;font-weight:700;margin-bottom:8px">데이터 불러오기 실패</div>
      <div style="font-size:13px;opacity:0.7;margin-bottom:20px">${msg}</div>
      <button onclick="loadData()" style="padding:10px 24px;background:#1e6fd9;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px">다시 시도</button>
    </div>`;
}

async function loadData() {
  showLoading();
  document.getElementById('lastUpdated').textContent = '불러오는 중...';
  try {
    const [csvBwts, csvSox] = await Promise.all([
      fetch(csvUrl(BWTS_GID)).then(r => { if(!r.ok) throw new Error('BWTS fetch 실패: ' + r.status); return r.text(); }),
      fetch(csvUrl(SOX_GID)).then(r => { if(!r.ok) throw new Error('SOX fetch 실패: ' + r.status); return r.text(); })
    ]);
    console.log('BWTS CSV 길이:', csvBwts.length, 'SOX CSV 길이:', csvSox.length);
    BWTS = parseBWTSCsv(csvBwts);
    SOX  = parseSOXCsv(csvSox);
    console.log('BWTS 파싱:', BWTS.length, '척 / SOX 파싱:', SOX.length, '척');

    const now = new Date();
    document.getElementById('lastUpdated').textContent =
      `마지막 업데이트: ${now.getFullYear()}.${now.getMonth()+1}.${now.getDate()} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

    hideLoading();
    initDash();
    curData = allData();
    renderRTable(curData);
    renderCGrid('');
  } catch(e) {
    console.error('loadData 에러:', e);
    showError('Google Sheets에 접근할 수 없습니다.<br>' + e.message);
  }
}

// BWTS 시트 파싱 - 열 인덱스 직접 지정
function parseBWTSCsv(text) {
  const rows = parseCSVRows(text);
  if (rows.length < 2) return [];
  // A=0, B=1, C=2, D=3, E=4, F=5, G=6, H=7, I=8, J=9, K=10, L=11,
  // M=12, N=13, O=14, P=15, Q=16, R=17, S=18, T=19,
  // U=20, V=21, W=22, X=23, Y=24, Z=25, AA=26, AB=27
  return rows.slice(1).filter(r => r[5] && r[5].trim()).map(r => ({
    ship:    (r[5]  || '').trim(),       // F: SHIP NAME
    imo:     (r[3]  || '').trim(),       // D: IMO
    project: (r[2]  || '').trim(),       // C: 프로젝트
    owner:   (r[6]  || '').replace(/^\t/,'').trim(), // G: SHIP OWNER
    country: (r[7]  || '').trim(),       // H: 국가
    type:    (r[8]  || '').trim(),       // I: SHIP'S TYPE
    spec:    (r[10] || '').trim(),       // K: SPEC (DESIGN)
    pt:      (r[12] || '').trim(),       // M: PT
    mtr:     (r[13] || '').trim(),       // N: MTR(PT)
    tt:      (r[14] || '').trim(),       // O: TT
    tt_ex:   (r[15] || '').trim(),       // P: TT(EX)
    uvi:     (r[16] || '').trim(),       // Q: UVI
    fmu:     (r[17] || '').trim(),       // R: FMU
    order25: isTrue(r[20] || ''),        // U: 2025 수주
    amt25:   parseFloat((r[21] || '').replace(/[^0-9.]/g,'')) || null, // V: 2025 수주금액
    date25:  (r[22] || '').replace(/\\/g,'').trim(), // W: 2025 실행일자
    est26:   isTrue(r[23] || ''),        // X: 2026 견적
    order26: isTrue(r[24] || ''),        // Y: 2026 수주
    date26:  (r[25] || '').trim(),       // Z: 2026 실행일자
    svc:     (r[26] || '').trim(),       // AA: 2026 SERVICE 형태
    _t:      'BWTS'
  }));
}

// SOX 시트 파싱
function parseSOXCsv(text) {
  const rows = parseCSVRows(text);
  if (rows.length < 2) return [];
  const headers = rows[0];
  const h = (name) => headers.findIndex(h => h.includes(name));
  const shipIdx    = h('SHIP NAME');
  const imoIdx     = headers.findIndex(h => h.includes('IMO'));
  const projIdx    = headers.findIndex(h => h.includes('PROJECT') || h.includes('HULL'));
  const ownerIdx   = h('SHIP OWNER');
  const countryIdx = h('국가');
  const typeIdx    = h("SHIP'S TYPE");
  const otpIdx     = h('OTP');
  const turIdx     = h('TUR');
  const pahIdx     = h('PaH');
  const sysIdx     = h('SYSTEM');
  const amtIdx     = headers.findIndex(h => h.includes('계약금액'));
  const statusIdx  = headers.findIndex(h => h.includes('계약STATUS') || (h.includes('계약') && h.includes('STATUS')));

  return rows.slice(1).filter(r => r[shipIdx] && r[shipIdx].trim() && r[shipIdx].trim() !== '-').map(r => ({
    ship:    r[shipIdx]?.trim() || '',
    imo:     r[imoIdx]?.trim() || '',
    project: r[projIdx]?.trim() || '',
    owner:   (r[ownerIdx] || '').replace(/^\t/, '').trim(),
    country: r[countryIdx]?.trim() || '',
    type:    r[typeIdx]?.trim() || '',
    otp:     r[otpIdx]?.trim() || '',
    tur:     parseInt(r[turIdx] || '0') || 0,
    pah:     parseInt(r[pahIdx] || '0') || 0,
    system:  r[sysIdx]?.trim() || '',
    cAmt:    r[amtIdx]?.trim() || '',
    status:  r[statusIdx]?.trim() || '',
    _t:      'SCRUBBER'
  }));
}

// CSV를 2D 배열로 파싱 (따옴표 안 줄바꿈 처리)
function parseCSVRows(text) {
  const rows = [];
  let cur = [];
  let cell = '';
  let inQ = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i+1];

    if (inQ) {
      if (ch === '"' && next === '"') { cell += '"'; i++; }
      else if (ch === '"') { inQ = false; }
      else { cell += ch; }
    } else {
      if (ch === '"') { inQ = true; }
      else if (ch === ',') { cur.push(cell.trim()); cell = ''; }
      else if (ch === '\n') {
        cur.push(cell.trim());
        if (cur.some(c => c !== '')) rows.push(cur);
        cur = []; cell = '';
      } else if (ch === '\r') { /* skip */ }
      else { cell += ch; }
    }
  }
  if (cell || cur.length) { cur.push(cell.trim()); if (cur.some(c=>c!=='')) rows.push(cur); }
  return rows;
}
  const lines = text.split(/\r?\n/);
  const bwtsRows = [];
  const soxRows  = [];
  let mode = null;
  let bwtsHeaders = null;
  let soxHeaders  = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = parseLine(line);
    const first = (cols[0] || '').trim();
    const joined = cols.join('|').toLowerCase();

    // BWTS 헤더 감지: 'No.' 또는 'SHIP NAME' 포함
    if (!bwtsHeaders && joined.includes('ship name') && joined.includes('ship owner') && joined.includes('spec')) {
      bwtsHeaders = cols.map(c => c.trim());
      mode = 'bwts';
      continue;
    }

    // SOX 헤더 감지: 'OTP DATE' 포함
    if (joined.includes('otp date') && joined.includes('ship name')) {
      soxHeaders = cols.map(c => c.trim());
      mode = 'sox';
      continue;
    }

    // MRO계약 헤더 감지: '계약기간' 포함 → 수집 중단
    if (joined.includes('계약기간') && joined.includes('계약금액')) {
      mode = null;
      continue;
    }

    if (mode === 'bwts' && bwtsHeaders) {
      const obj = {};
      bwtsHeaders.forEach((h, idx) => { obj[h] = (cols[idx] || '').trim(); });
      const ship = obj['SHIP NAME'] || '';
      if (ship && ship !== 'SHIP NAME') bwtsRows.push(obj);
    } else if (mode === 'sox' && soxHeaders) {
      const obj = {};
      soxHeaders.forEach((h, idx) => { obj[h] = (cols[idx] || '').trim(); });
      const ship = obj['SHIP NAME'] || '';
      if (ship && ship !== 'SHIP NAME') soxRows.push(obj);
    }
  }

  return {
    bwts: bwtsRows.map(r => ({
      ship:    r['SHIP NAME'] || '',
      imo:     r['IMO'] || '',
      project: r['프로젝트'] || '',
      owner:   (r['SHIP OWNER'] || '').replace(/^\t/, '').trim(),
      country: r['국가'] || '',
      type:    r["SHIP'S TYPE"] || '',
      spec:    r['SPEC (DESIGN)'] || '',
      pt:      r['PT'] || '',
      mtr:     r['MTR\n(PT)'] || r['MTR(PT)'] || '',
      tt:      r['TT'] || '',
      tt_ex:   r['TT (EX)'] || '',
      uvi:     r['UVI'] || '',
      fmu:     r['FMU'] || '',
      order25: isTrue(r['2025\n수주'] || r['2025 수주'] || ''),
      amt25:   parseFloat((r['2025\n수주 금액'] || r['2025 수주 금액'] || '').replace(/[^0-9.]/g,'')) || null,
      date25:  (r['2025\n실행일자'] || r['2025 실행일자'] || '').replace(/\\/g, ''),
      est26:   isTrue(r['2026\n견적'] || r['2026 견적'] || ''),
      order26: isTrue(r['2026\n수주'] || r['2026 수주'] || ''),
      date26:  r['2026\n실행일자'] || r['2026 실행일자'] || '',
      svc:     r['2026\n SERVICE 형태'] || r['2026 SERVICE 형태'] || '',
      _t:      'BWTS'
    })),
    sox: soxRows.map(r => ({
      ship:    r['SHIP NAME'] || '',
      imo:     r['IMO NO.'] || r['IMO'] || '',
      project: r['PROJECT (HULL NO.)'] || '',
      owner:   (r['SHIP OWNER'] || '').replace(/^\t/, '').trim(),
      country: r['국가'] || '',
      type:    r["SHIP'S TYPE"] || '',
      otp:     r['OTP DATE'] || '',
      tur:     parseInt(r['TUR'] || '0') || 0,
      pah:     parseInt(r['PaH'] || '0') || 0,
      system:  r['SYSTEM'] || '',
      cAmt:    r['계약금액(Y열)'] || '',
      status:  r['계약STATUS(Z열)'] || '',
      _t:      'SCRUBBER'
    }))
  };
}

function showPage(id, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  el.classList.add('active');
}

// ======================== DASHBOARD ========================
function initDash() {
  // ── KPI 5개 ──
  const totalBwts = BWTS.length;
  const totalSox  = SOX.length;
  const allOwners = new Set([...BWTS.map(r=>r.owner), ...SOX.map(r=>r.owner)]);
  const allCountries = new Set([
    ...BWTS.map(r=>(r.country||'').trim().toUpperCase()).filter(Boolean),
    ...SOX.map(r=>(r.country||'').trim().toUpperCase()).filter(Boolean)
  ]);
  document.getElementById('k-total').textContent    = (totalBwts + totalSox).toLocaleString();
  document.getElementById('k-bwts').textContent     = totalBwts.toLocaleString();
  document.getElementById('k-sox').textContent      = totalSox.toLocaleString();
  document.getElementById('k-owners').textContent   = allOwners.size.toLocaleString();
  document.getElementById('k-countries').textContent= allCountries.size.toLocaleString();

  // ── 계약 현황 ──
  const b25 = BWTS.filter(r=>r.order25).length;
  const b26 = BWTS.filter(r=>r.order26).length;
  const s25 = SOX.filter(r=>r.status==='계약유효').length;
  const s26 = SOX.filter(r=>r.order26||false).length;
  const pct = (n,d) => d>0 ? Math.round(n/d*100)+'%' : '0%';

  document.getElementById('cb25').textContent  = b25;
  document.getElementById('cb25p').textContent = `${pct(b25,totalBwts)} 가입률`;
  document.getElementById('cb26').textContent  = b26;
  document.getElementById('cb26p').textContent = `${pct(b26,totalBwts)} 가입률`;
  document.getElementById('cs25').textContent  = s25;
  document.getElementById('cs25p').textContent = `${pct(s25,totalSox)} 가입률`;
  document.getElementById('cs26').textContent  = s26;
  document.getElementById('cs26p').textContent = `${pct(s26,totalSox)} 가입률`;

  // ── 상위 선주사 20개 ──
  const om = {};
  BWTS.forEach(r => {
    const k = r.owner||'';
    if(!om[k]) om[k] = {owner:k, country:r.country||'', bwts:0, bwts25:0, sox:0, sox25:0};
    om[k].bwts++;
    if(r.order25) om[k].bwts25++;
  });
  SOX.forEach(r => {
    const k = r.owner||'';
    if(!om[k]) om[k] = {owner:k, country:r.country||'', bwts:0, bwts25:0, sox:0, sox25:0};
    om[k].sox++;
    if(r.status==='계약유효') om[k].sox25++;
  });

  const sorted = Object.values(om)
    .map(o=>({...o, total:o.bwts+o.sox}))
    .filter(o=>o.total>0)
    .sort((a,b)=>b.total-a.total)
    .slice(0,20);

  document.getElementById('ownerTb').innerHTML = sorted.map((o,i) => {
    const bwtsPct = o.bwts>0 ? Math.round(o.bwts25/o.bwts*100)+'%' : '-';
    const soxPct  = o.sox>0  ? Math.round(o.sox25/o.sox*100)+'%'   : '-';
    const totPct  = o.total>0? Math.round((o.bwts25+o.sox25)/o.total*100)+'%' : '0%';
    return `<tr>
      <td style="color:#9ba3bc;font-weight:700;font-size:12px">#${i+1}</td>
      <td style="font-weight:700;color:#0d1b3e;font-size:13px">${o.owner}</td>
      <td><span style="font-size:10px;background:#f0f2f7;padding:2px 8px;border-radius:10px;color:#5a6480;font-weight:600">${(o.country||'-').toUpperCase()}</span></td>
      <td style="color:#1e6fd9;font-weight:700;font-size:14px">${o.bwts>0?o.bwts:'-'}</td>
      <td style="color:#1e6fd9;font-size:12px;font-weight:600">${bwtsPct}</td>
      <td style="color:#10b981;font-weight:700;font-size:14px">${o.sox>0?o.sox:'-'}</td>
      <td style="color:#10b981;font-size:12px;font-weight:600">${soxPct}</td>
      <td style="font-weight:800;font-size:14px;color:#0d1b3e">${o.total}</td>
      <td style="font-weight:700;font-size:12px;color:${parseInt(totPct)>50?'#10b981':parseInt(totPct)>20?'#f59e0b':'#7a85a3'}">${totPct}</td>
    </tr>`;
  }).join('');

  // ── 재계약 리마인더 ──
  calcReminder();
}

// 날짜 파싱 (2025. 2. 13 형식)
function parseDate25(str) {
  if(!str) return null;
  const clean = str.replace(/\s/g,'').replace(/\\/g,'');
  const m = clean.match(/(\d{4})\.(\d{1,2})\.(\d{1,2})/);
  if(!m) return null;
  return new Date(parseInt(m[1]), parseInt(m[2])-1, parseInt(m[3]));
}

let reminderVessels = [];

function calcReminder() {
  const today = new Date();

  // 디버깅: 2025 수주 있는 선박들 확인
  const has25 = BWTS.filter(r=>r.order25);
  console.log('2025 수주 선박 수:', has25.length);
  console.log('샘플 date25:', has25.slice(0,3).map(r=>({ship:r.ship, date25:r.date25, est26:r.est26})));

  reminderVessels = BWTS.filter(r => {
    if(!r.order25) return false;
    if(r.est26)    return false;
    const d = parseDate25(r.date25);
    if(!d) return false;
    const diff = Math.floor((today - d) / (1000*60*60*24));
    return diff >= 330;
  });

  console.log('리마인더 대상:', reminderVessels.length, '척');
  console.log('330일 미달로 제외된 것들:', BWTS.filter(r=>{
    if(!r.order25||r.est26) return false;
    const d = parseDate25(r.date25);
    if(!d) return false;
    const diff = Math.floor((today-d)/(1000*60*60*24));
    return diff < 330;
  }).map(r=>({ship:r.ship,date25:r.date25,diff:Math.floor((today-parseDate25(r.date25))/(1000*60*60*24))})));

  const banner = document.getElementById('reminderBanner');
  const btn    = document.getElementById('reminderBtn');
  if(reminderVessels.length > 0) {
    banner.style.display = 'flex';
    btn.textContent = `${reminderVessels.length}척 확인`;
  } else {
    banner.style.display = 'none';
  }
}

function openReminderModal() {
  const today = new Date();
  document.getElementById('reminderModalTitle').textContent =
    `재계약 컨택 필요 호선 (${reminderVessels.length}척)`;
  document.getElementById('reminderTableBody').innerHTML = reminderVessels.map((r, idx) => {
    const d = parseDate25(r.date25);
    const diff = d ? Math.floor((today - d)/(1000*60*60*24)) : '-';
    return `<tr style="border-bottom:1px solid #f0f2f7" onmouseover="this.style.background='#f8f9ff'" onmouseout="this.style.background=''">
      <td style="padding:11px 12px;font-weight:700;color:#0d1b3e">${r.ship}</td>
      <td style="padding:11px 12px;font-size:12px;color:#5a6480">${r.owner}</td>
      <td style="padding:11px 12px;font-size:12px;color:#5a6480">${r.date25||'-'}</td>
      <td style="padding:11px 12px;text-align:center">
        <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;background:${diff>=365?'#fee2e2':'#fef3c7'};color:${diff>=365?'#b91c1c':'#92400e'}">${diff}일</span>
      </td>
      <td style="padding:11px 12px;text-align:center">
        <button onclick="openReminderDetail(${idx})" style="width:28px;height:28px;border-radius:50%;border:1.5px solid #d9dff0;background:none;cursor:pointer;font-size:12px;color:#7a85a3;font-weight:700;font-family:inherit" title="상세보기">i</button>
      </td>
    </tr>`;
  }).join('');
  document.getElementById('reminderOverlay').classList.add('open');
}

function openReminderDetail(idx) {
  const r = reminderVessels[idx];
  // 기존 선박 상세 모달 재활용
  curData = reminderVessels.map(v=>({...v,_t:'BWTS'}));
  document.getElementById('reminderOverlay').classList.remove('open');
  openModal(idx);
}

function closeReminderModal(e) {
  if(e.target === document.getElementById('reminderOverlay'))
    document.getElementById('reminderOverlay').classList.remove('open');
}

// ======================== SEARCH ========================
let curData = [];
function setStab(t, el) {
  document.querySelectorAll('.search-tab').forEach(x=>x.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('multiBox').style.display = t==='multi'?'block':'none';
}

function allData() {
  return [...BWTS.map(r=>({...r,_t:'BWTS'})),...SOX.map(r=>({...r,_t:'SCRUBBER'}))];
}

function doSearch() {
  const q = (document.getElementById('sInput').value||'').toLowerCase().trim();
  const all = allData();
  curData = q ? all.filter(r =>
    (r.ship||'').toLowerCase().includes(q)||
    (r.imo||'').toLowerCase().includes(q)||
    (r.owner||'').toLowerCase().includes(q)||
    (r.project||'').toLowerCase().includes(q)||
    (r.type||'').toLowerCase().includes(q)||
    (r.country||'').toLowerCase().includes(q)
  ) : all;
  renderRTable(curData);
}

function renderRTable(data) {
  document.getElementById('rCount').textContent = data.length;
  document.getElementById('rFooter').textContent = `총 ${data.length}개의 선박이 검색되었습니다.`;
  document.getElementById('rTb').innerHTML = data.map((r, idx) => {
    const ib = r._t==='BWTS';
    return `<tr>
      <td style="text-align:center"><button style="width:22px;height:22px;border-radius:5px;border:1px solid #d9dff0;background:#f6f8fc;cursor:pointer;font-size:9px;color:#7a85a3">+</button></td>
      <td><span class="type-badge ${ib?'tb-bwts':'tb-sox'}">${r._t}</span></td>
      <td style="font-family:monospace;font-size:11px;color:#7a85a3">${r.imo||'-'}</td>
      <td>
        <span class="ship-name">${r.ship}</span>
        <button class="info-btn" onclick="openModal(${idx})" title="상세 정보">i</button>
      </td>
      <td style="font-size:11px;color:#5a6480">${r.project||r.system||'-'}</td>
      <td style="font-size:11px">${r.owner}</td>
      <td style="font-size:11px">${r.country}</td>
      <td style="font-size:11px;font-family:monospace">${r.spec||r.system||'-'}</td>
      <td style="text-align:center">${(ib&&r.order25)||(!ib&&r.status==='계약유효')?'<span class="chk">✓</span>':'<span class="dsh">-</span>'}</td>
      <td style="text-align:center">${ib&&r.est26?'<span class="chk">✓</span>':'<span class="dsh">-</span>'}</td>
      <td style="text-align:center">${ib&&r.order26?'<span class="chk">✓</span>':'<span class="dsh">-</span>'}</td>
    </tr>`;
  }).join('');
}

function openModal(idx) {
  const r = curData[idx];
  if (!r) return;
  const ib = r._t==='BWTS';
  document.getElementById('mTitle').textContent = r.ship;
  document.getElementById('mBody').innerHTML = `
    <div class="m-section">
      <h3>선박 정보</h3>
      <div class="m-grid">
        <div class="m-item"><label>IMO</label><span>${r.imo||'-'}</span></div>
        <div class="m-item"><label>선명</label><span>${r.ship}</span></div>
        <div class="m-item ${ib?'':'full'}"><label>프로젝트</label><span>${r.project||r.system||'-'}</span></div>
        ${ib?`<div class="m-item"><label>용량 / SPEC</label><span>${r.spec||'-'}</span></div>`:''}
        <div class="m-item"><label>선종</label><span>${r.type||'-'}</span></div>
        <div class="m-item"><label>유형</label><span><span class="type-badge ${ib?'tb-bwts':'tb-sox'}">${r._t}</span></span></div>
      </div>
    </div>
    <div class="m-section">
      <h3>선주사 정보</h3>
      <div class="m-grid">
        <div class="m-item"><label>선주사</label><span>${r.owner}</span></div>
        <div class="m-item"><label>국가</label><span>${r.country}</span></div>
      </div>
    </div>
    ${ib?`
    <div class="m-section">
      <h3>센서 / 스펙</h3>
      <div class="spec-grid">
        <div class="spec-box"><label>PT</label><span>${r.pt||'-'}</span></div>
        <div class="spec-box"><label>MTR(PT)</label><span>${r.mtr||'-'}</span></div>
        <div class="spec-box"><label>TT</label><span>${r.tt||'-'}</span></div>
        <div class="spec-box"><label>TT(EX)</label><span>${r.tt_ex||'-'}</span></div>
        <div class="spec-box"><label>UVI</label><span>${r.uvi||'-'}</span></div>
        <div class="spec-box"><label>FMU</label><span>${r.fmu||'-'}</span></div>
      </div>
    </div>
    <div class="m-section">
      <h3>수주 현황</h3>
      <div class="m-grid">
        <div class="m-item"><label>2025 수주</label><span>${r.order25?'✅ 수주확정':'—'}</span></div>
        <div class="m-item"><label>2025 실행일</label><span>${r.date25||'-'}</span></div>
        <div class="m-item"><label>2026 견적</label><span>${r.est26?'✅ 견적확보':'—'}</span></div>
        <div class="m-item"><label>2026 수주</label><span>${r.order26?'✅ 수주확정':'—'}</span></div>
        <div class="m-item"><label>서비스 형태</label><span>${r.svc||'-'}</span></div>
        <div class="m-item"><label>2026 일정</label><span>${r.date26||'-'}</span></div>
        ${r.amt25?`<div class="m-item full"><label>2025 수주금액</label><span style="font-size:16px;font-weight:800;color:#1e6fd9">USD ${r.amt25.toLocaleString()}</span></div>`:''}
      </div>
    </div>`:
    `<div class="m-section">
      <h3>SOX Scrubber 정보</h3>
      <div class="m-grid">
        <div class="m-item"><label>센서 시스템</label><span>${r.system||'-'}</span></div>
        <div class="m-item"><label>OTP DATE</label><span>${r.otp||'-'}</span></div>
        <div class="m-item"><label>TUR 수량</label><span>${r.tur||'-'}</span></div>
        <div class="m-item"><label>PaH 수량</label><span>${r.pah||'-'}</span></div>
        <div class="m-item"><label>계약금액</label><span>${r.cAmt||'-'}</span></div>
        <div class="m-item"><label>계약 상태</label><span style="font-weight:700;color:${r.status==='계약유효'?'#10b981':r.status==='계약파기'?'#ef4444':'#f59e0b'}">${r.status||'-'}</span></div>
      </div>
    </div>`}
  `;
  document.getElementById('mOverlay').classList.add('open');
}
function closeMo(e){if(e.target===document.getElementById('mOverlay'))closeMoDirect();}
function closeMoDirect(){document.getElementById('mOverlay').classList.remove('open');}

function exportExcel(){
  const data=curData.length?curData:allData();
  const ws=XLSX.utils.json_to_sheet(data);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'선박현황');
  XLSX.writeFile(wb,'PANASIA_AM_선박현황.xlsx');
}

// ======================== COUNTRY ========================
let aMode='country', selItem=null;

const ALL_C=[...new Set([
  ...BWTS.map(r=>r.country==='South Korea'||r.country==='SOUTH KOREA'?'SOUTH KOREA':r.country.toUpperCase()),
  ...SOX.map(r=>{const c=r.country;
    if(c==='South Korea')return 'SOUTH KOREA';
    return c.toUpperCase();
  })
])].sort();

const ALL_O=[...new Set([...BWTS.map(r=>r.owner),...SOX.map(r=>r.owner)])].sort();

function setAtab(mode,el){
  aMode=mode;selItem=null;
  document.querySelectorAll('.analysis-tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('cInput').placeholder=mode==='country'?'국가 검색...':'선주사 검색...';
  document.getElementById('cInput').value='';
  renderCGrid('');
  document.getElementById('cResult').classList.remove('show');
}

function filterC(){renderCGrid(document.getElementById('cInput').value.toLowerCase());}

function renderCGrid(q){
  const items=(aMode==='country'?ALL_C:ALL_O).filter(x=>!q||x.toLowerCase().includes(q));
  document.getElementById('cGrid').innerHTML=items.map(x=>
    `<button class="c-btn${selItem===x?' selected':''}" onclick="selC('${x.replace(/'/g,"\\'")}')">${x}</button>`
  ).join('');
}

function normC(c){
  if(!c)return '';
  const u=c.toUpperCase();
  if(u==='SOUTH KOREA')return 'SOUTH KOREA';
  return u;
}

function selC(val){
  selItem=val;
  renderCGrid(document.getElementById('cInput').value.toLowerCase());
  const nu=val.toUpperCase();
  const bF=BWTS.filter(r=>aMode==='country'?normC(r.country)===nu:r.owner===val);
  const sF=SOX.filter(r=>aMode==='country'?normC(r.country)===nu:r.owner===val);
  const res=document.getElementById('cResult');
  res.classList.add('show');
  document.getElementById('cResultTitle').textContent=`${val} — BWTS ${bF.length}척 · SOX ${sF.length}건`;

  if(aMode==='country'){
    const om={};
    bF.forEach(r=>{if(!om[r.owner])om[r.owner]={owner:r.owner,bwts:[],sox:[]};om[r.owner].bwts.push(r);});
    sF.forEach(r=>{if(!om[r.owner])om[r.owner]={owner:r.owner,bwts:[],sox:[]};om[r.owner].sox.push(r);});
    document.getElementById('oCards').innerHTML=Object.values(om).map(o=>`
      <div class="owner-card" onclick="toggleVL('${o.owner.replace(/'/g,"\\'")}')">
        <h4>${o.owner}</h4>
        <div class="owner-card-stats">
          <span class="tag tag-bwts">BWTS ${o.bwts.length}</span>
          <span class="tag tag-sox">SOX ${o.sox.length}</span>
        </div>
        <div class="vessel-mini-list" id="vl-${o.owner.replace(/[^a-zA-Z0-9]/g,'_')}">
          ${[...o.bwts.map(v=>`<div class="v-row"><span><b>${v.ship}</b> <span style="font-size:10px;color:#9ba3bc">${v.imo||''}</span></span><span class="tag tag-bwts" style="font-size:10px">${v.order25?'2025수주':'견적'}</span></div>`),
             ...o.sox.map(v=>`<div class="v-row"><span><b>${v.ship}</b> <span style="font-size:10px;color:#9ba3bc">${v.imo||''}</span></span><span class="tag tag-sox" style="font-size:10px">${v.status||'SOX'}</span></div>`)].join('')}
        </div>
      </div>`).join('')||'<p style="color:#9ba3bc;font-size:13px;grid-column:1/-1">해당 국가의 데이터가 없습니다.</p>';
    document.getElementById('dVessels').innerHTML='';
  } else {
    document.getElementById('oCards').innerHTML='';
    const all=[...bF.map(r=>({...r,_t:'BWTS'})),...sF.map(r=>({...r,_t:'SOX'}))];
    document.getElementById('dVessels').innerHTML=all.map(v=>`
      <div class="v-row">
        <span><span class="type-badge ${v._t==='BWTS'?'tb-bwts':'tb-sox'}" style="margin-right:8px">${v._t}</span><b>${v.ship}</b><span style="font-size:11px;color:#9ba3bc;margin-left:6px">${v.imo||''}</span></span>
        <span style="font-size:11px;color:#5a6480">${v._t==='BWTS'?(v.order25?'2025 수주':'견적'):(v.status||'-')}</span>
      </div>`).join('')||'<p style="color:#9ba3bc;font-size:13px">해당 선주사의 데이터가 없습니다.</p>';
  }
}

function toggleVL(owner){
  const el=document.getElementById('vl-'+owner.replace(/[^a-zA-Z0-9]/g,'_'));
  if(el) el.style.display=el.style.display==='block'?'none':'block';
}

// ======================== INIT ========================
loadData();
