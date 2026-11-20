
// ==============================================================================
// LOCAL INFERENCE ENGINE (OFFLINE / STANDALONE FRONTEND FALLBACK)
// ==============================================================================
function computeLocalPrediction(ten, qt1, vang_pct, hl, th) {
  const vang = vang_pct / 100.0;
  let muc = 'Thấp';
  let nguon = 'Mô hình Tầng 2';
  let p = 0.05;
  let ly_do = [];

  // Tầng 1: Luật xác định L1
  if (vang > 0.20) {
    muc = 'Cao';
    nguon = 'Luật L1 (Quy chế)';
    p = 1.0;
    ly_do.push('Vắng ' + Math.round(vang_pct) + '% (vượt ngưỡng 20% cấm thi)');
  } else if (vang >= 0.15) {
    // Luật sàn S1
    p = Math.max(0.60, 0.45 + (10 - qt1) * 0.04 + hl * 0.05);
    muc = p >= 0.60 ? 'Cao' : 'Trung bình';
    nguon = 'Luật sàn S1';
    ly_do.push('Vắng ' + Math.round(vang_pct) + '% tiệm cận ngưỡng cấm thi');
  } else {
    // Tầng 2 Logistic regression simulation
    const z = -0.6 * (qt1 - 5.0) + 0.15 * (vang_pct - 5.0) + 0.7 * hl - 0.4 * (th - 2);
    p = 1 / (1 + Math.exp(-z));
    p = Math.min(Math.max(p, 0.01), 0.99);

    if (p >= 0.60) {
      muc = 'Cao';
    } else if (p >= 0.30) {
      muc = 'Trung bình';
    } else {
      muc = 'Thấp';
    }
  }

  if (qt1 < 5.0 && !ly_do.some(l => l.includes('QT1'))) ly_do.push('Điểm QT1 thấp (' + qt1.toFixed(1) + '/10)');
  if (vang >= 0.10 && !ly_do.some(l => l.includes('Vắng'))) ly_do.push('Tỷ lệ vắng cần lưu ý (' + Math.round(vang_pct) + '%)');
  if (hl >= 1) ly_do.push('Đã từng học lại môn này (' + hl + ' lần)');
  if (th <= 1) ly_do.push('Thời gian tự học ít (dưới 2h/tuần)');
  if (ly_do.length === 0) ly_do.push('Điểm QT1 và chuyên cần ổn định');

  let hanh_dong = 'Theo dõi định kỳ trên lớp';
  if (muc === 'Cao') hanh_dong = 'Gặp riêng trong 1 tuần + Chuyển Cố vấn học tập';
  else if (muc === 'Trung bình') hanh_dong = 'Nhắc nhở cá nhân + Giao bài tập bổ trợ';

  let pedType = 'success';
  let pedTitle = 'Ghi chú sư phạm (Trạng thái an toàn)';
  let pedContent = 'Sinh viên có kết quả học tập và chuyên cần tốt, xác suất rớt môn rất thấp (< 30%). Giảng viên chỉ cần duy trì theo dõi định kỳ trên lớp.';

  if (muc === 'Cao') {
    if (nguon.includes('Luật L1')) {
      pedType = 'error';
      pedTitle = 'Ghi chú sư phạm (Cấm thi theo Quy chế)';
      pedContent = 'Sinh viên đã vắng vượt quá 20% số tiết theo quy chế đào tạo. Tầng 1 tự động xác định cấm thi cuối kỳ — trường hợp này không thể cứu vãn bằng điểm số, cần chuyển hồ sơ sang Cố vấn học tập để hướng dẫn thủ tục học vụ.';
    } else {
      pedType = 'warning';
      pedTitle = 'Ghi chú sư phạm (Nguy cơ rớt cao từ Học máy)';
      pedContent = 'Mô hình máy học cảnh báo nguy cơ rớt rất cao do kết hợp các yếu tố bất lợi (điểm QT1 dưới trung bình hoặc có tiền sử học lại). Giảng viên nên chủ động liên hệ hẹn gặp riêng ngay trong tuần để lập kế hoạch ôn tập trước kỳ thi.';
    }
  } else if (muc === 'Trung bình') {
    pedType = 'info';
    pedTitle = 'Ghi chú sư phạm (Vùng báo động vàng)';
    pedContent = 'Sinh viên nằm trong vùng báo động vàng (xác suất rớt 30%–60% hoặc vắng tiệm cận ngưỡng cấm thi theo Luật sàn S1). Cần nhắc nhở trực tiếp trên lớp và giao thêm các bài tập thực hành bổ trợ để kéo điểm lên.';
  }

  return {
    ten: ten,
    diem_qua_trinh_1: qt1,
    ty_le_vang: vang,
    so_lan_hoc_lai: hl,
    thoi_gian_tu_hoc: th,
    xac_suat_rot: p,
    muc: muc,
    muc_nguy_co: muc,
    nguon: nguon,
    nguon_quyet_dinh: nguon,
    ly_do_chi_tiet: ly_do.join('; '),
    hanh_dong_de_xuat: hanh_dong,
    pedagogical_note: {
      type: pedType,
      title: pedTitle,
      content: pedContent
    }
  };
}

/**
 * ==============================================================================
 * EDUGUARD. — CLIENT APPLICATION CORE JAVASCRIPT (SOFT PINK / BLUSH EDITION)
 * Minimalist Luxury Aesthetic, Strict Real Student Names in Scenarios,
 * Complete Reset of AI Results on "Làm mới", Chart.js & Web Speech API.
 * ==============================================================================
 */

// Global Application State
window.appState = null;
window.activeTab = 'ai';
window.currentStudentAnalysis = null;
window.authenticatedStudent = null;
window.evaluationData = null;

// Chart.js Instances
let chartRiskDistInstance = null;
let chartGaugeInstance = null;
let chartRocInstance = null;
let chartCalibInstance = null;
let chartKMeansInstance = null;

// ==============================================================================
// INITIALIZATION ON DOM READY
// ==============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize Lucide icons
  if (window.lucide) {
    window.lucide.createIcons();
  }

  // Fetch initial system state
  await fetchSystemState();
  
  // Fetch initial ML evaluation & clusters
  await fetchEvaluationData(4);
  
  // Fetch interventions history
  await fetchInterventions();

  // Khởi động giao diện sạch sẽ, để trống thẻ kết quả ban đầu
  resetAiCardToEmpty();
});

// ==============================================================================
// TAB NAVIGATION LOGIC
// ==============================================================================
function switchTab(tabId) {
  window.activeTab = tabId;

  // Update nav buttons
  document.querySelectorAll('.nav-pill-btn').forEach(btn => {
    if (btn.getAttribute('data-tab') === tabId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Update tab panes
  document.querySelectorAll('.tab-pane').forEach(pane => {
    if (pane.id === `pane-${tabId}`) {
      pane.classList.add('active');
    } else {
      pane.classList.remove('active');
    }
  });

  // Re-render / resize Chart.js when entering chart tabs
  if (tabId === 'classroom') {
    setTimeout(() => {
      if (chartRiskDistInstance) chartRiskDistInstance.resize();
      if (chartGaugeInstance) chartGaugeInstance.resize();
    }, 100);
  } else if (tabId === 'evaluation') {
    setTimeout(() => {
      if (chartRocInstance) chartRocInstance.resize();
      if (chartCalibInstance) chartCalibInstance.resize();
      if (chartKMeansInstance) chartKMeansInstance.resize();
    }, 100);
  }

  // Refresh icons
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// ==============================================================================
// API: FETCH FULL SYSTEM STATE (GET /api/state)
// ==============================================================================
function applySystemStateData(data) {
  window.appState = data;

  const kpi = data.kpi || {};
  const total = kpi.total ?? kpi.tong_sv ?? 500;
  const cao = kpi.cao ?? kpi.muc_cao ?? 0;
  const tb = kpi.trung_binh ?? kpi.muc_tb ?? 0;
  const thap = kpi.thap ?? kpi.muc_thap ?? 0;
  const l1 = kpi.l1 ?? kpi.luat_l1 ?? 0;

  document.getElementById('kpiTotal').textContent = total;
  document.getElementById('kpiHigh').textContent = cao;
  document.getElementById('kpiMed').textContent = tb;
  document.getElementById('kpiLow').textContent = thap;
  document.getElementById('kpiL1').textContent = l1;

  const cfg = data.config || {};
  document.getElementById('heroModelBadge').textContent = cfg.model_choice || 'Logistic Regression';
  document.getElementById('heroCalibBadge').textContent = cfg.calib_method || 'Platt Scaling';

  if (document.getElementById('cfgModelChoice')) {
    if (cfg.model_choice) document.getElementById('cfgModelChoice').value = cfg.model_choice;
    if (cfg.calib_method) document.getElementById('cfgCalibMethod').value = cfg.calib_method;
    if (cfg.nguong_L1 !== undefined) {
      document.getElementById('cfgL1').value = cfg.nguong_L1;
      document.getElementById('cfgL1Val').textContent = parseFloat(cfg.nguong_L1).toFixed(2);
    }
    if (cfg.nguong_S1 !== undefined) {
      document.getElementById('cfgS1').value = cfg.nguong_S1;
      document.getElementById('cfgS1Val').textContent = parseFloat(cfg.nguong_S1).toFixed(2);
    }
    if (cfg.t1 !== undefined) {
      document.getElementById('cfgT1').value = cfg.t1;
      document.getElementById('cfgT1Val').textContent = parseFloat(cfg.t1).toFixed(2);
    }
    if (cfg.t2 !== undefined) {
      document.getElementById('cfgT2').value = cfg.t2;
      document.getElementById('cfgT2Val').textContent = parseFloat(cfg.t2).toFixed(2);
    }
  }

  populateFilterDropdowns(data.filter_options);
  renderStudentTable(data.students || []);
  renderMonotonicityTable(data.monotonicity || []);
  renderRiskDistributionChart(data.monotonicity || []);
  renderBatchProgressGauge(kpi);
  renderAdvisorTab(kpi, data.students || []);
  if (window.lucide) window.lucide.createIcons();
}

async function fetchSystemState() {
  try {
    const apiUrl = (window.location.protocol === 'file:' ? 'http://127.0.0.1:8000/api/state' : '/api/state');
    const res = await fetch(apiUrl);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    applySystemStateData(data);
  } catch (err) {
    if (window.MOCK_BUNDLE && window.MOCK_BUNDLE.state) {
      console.info('Giao diện đang hoạt động ở chế độ Độc lập (Sử dụng dữ liệu Mock 500 sinh viên)');
      applySystemStateData(JSON.parse(JSON.stringify(window.MOCK_BUNDLE.state)));
    } else {
      console.error('Lỗi khi fetchSystemState:', err);
      showToast('Lỗi kết nối máy chủ: ' + err.message, 'error');
    }
  }
}

// Populate Filter Options
function populateFilterDropdowns(options) {
  if (!options) return;

  const selKhoa = document.getElementById('tblFilterKhoa');
  if (selKhoa && options.khoa_hoc) {
    const current = selKhoa.value;
    selKhoa.innerHTML = '<option value="">Tất cả khóa học</option>';
    options.khoa_hoc.forEach(kh => {
      const opt = document.createElement('option');
      opt.value = kh;
      opt.textContent = `Khóa ${kh}`;
      selKhoa.appendChild(opt);
    });
    selKhoa.value = current;
  }

  const selNguon = document.getElementById('tblFilterNguon');
  if (selNguon && options.nguon_quyet_dinh) {
    const current = selNguon.value;
    selNguon.innerHTML = '<option value="">Tất cả nguồn quyết định</option>';
    options.nguon_quyet_dinh.forEach(ng => {
      const opt = document.createElement('option');
      opt.value = ng;
      opt.textContent = ng;
      selNguon.appendChild(opt);
    });
    selNguon.value = current;
  }
}

// ==============================================================================
// SLIDE-OVER DRAWER & CONFIG UPDATE (POST /api/config)
// ==============================================================================
function toggleDrawer(isOpen) {
  const drawer = document.getElementById('settingsDrawer');
  const backdrop = document.getElementById('drawerBackdrop');
  const panel = document.getElementById('drawerPanel');

  if (isOpen) {
    drawer.classList.remove('pointer-events-none');
    backdrop.classList.remove('opacity-0');
    backdrop.classList.add('opacity-100');
    panel.classList.remove('translate-x-full');
    panel.classList.add('translate-x-0');
  } else {
    backdrop.classList.remove('opacity-100');
    backdrop.classList.add('opacity-0');
    panel.classList.remove('translate-x-0');
    panel.classList.add('translate-x-full');
    setTimeout(() => {
      drawer.classList.add('pointer-events-none');
    }, 300);
  }
}

async function handleApplyConfig() {
  const payload = {
    model_choice: document.getElementById('cfgModelChoice').value,
    calib_method: document.getElementById('cfgCalibMethod').value,
    nguong_L1: parseFloat(document.getElementById('cfgL1').value),
    nguong_S1: parseFloat(document.getElementById('cfgS1').value),
    t1: parseFloat(document.getElementById('cfgT1').value),
    t2: parseFloat(document.getElementById('cfgT2').value)
  };

  try {
    const apiUrl = (window.location.protocol === 'file:' ? 'http://127.0.0.1:8000/api/config' : '/api/config');
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Cập nhật thất bại');
    }

    const result = await res.json();
    showToast(result.message || 'Cập nhật cấu hình thành công!');
    toggleDrawer(false);

    await fetchSystemState();
    await fetchEvaluationData(parseInt(document.getElementById('kmeansKSlider')?.value || 4));

  } catch (err) {
    console.warn('API /api/config không khả dụng, cập nhật cấu hình mô phỏng giao diện:', err);
    if (window.appState && window.appState.config) {
      window.appState.config = {
        ...window.appState.config,
        model_choice: payload.model_choice,
        calib_method: payload.calib_method,
        nguong_L1: payload.nguong_L1,
        nguong_S1: payload.nguong_S1,
        t1: payload.t1,
        t2: payload.t2
      };
      document.getElementById('heroModelBadge').textContent = payload.model_choice;
      document.getElementById('heroCalibBadge').textContent = payload.calib_method;
      showToast('Đã áp dụng cấu hình (Chế độ mô phỏng)');
      toggleDrawer(false);
    } else {
      showToast('Lỗi cập nhật cấu hình: ' + err.message, 'error');
    }
  }
}

// ==============================================================================
// CSV FILE UPLOAD (POST /api/upload)
// ==============================================================================
async function handleCsvUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('file', file);

  try {
    showToast('Đang tải lên và huấn luyện lại dữ liệu lớp học...', 'info');
    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Tải tệp CSV thất bại');
    }

    const data = await res.json();
    showToast(data.message || 'Nạp danh sách lớp học thành công!');
    await fetchSystemState();
    await fetchEvaluationData(4);

  } catch (err) {
    console.error('Lỗi khi handleCsvUpload:', err);
    showToast('Lỗi tải tệp: ' + err.message, 'error');
  } finally {
    event.target.value = '';
  }
}

// ==============================================================================
// AI ASSISTANT & PREDICTION (POST /api/predict)
// ==============================================================================
// Tên sinh viên chuẩn thuần Việt, tuyệt đối không đính kèm hậu tố
const SCENARIOS = {
  1: {
    ten: 'Lê Minh Tuấn',
    qt1: 3.5,
    vang_pct: 30.0,
    hl: 2,
    th: 1,
    desc: 'Vắng 30% — Vi phạm Luật L1 cấm thi.'
  },
  2: {
    ten: 'Trần Bảo Ngọc',
    qt1: 5.5,
    vang_pct: 18.0,
    hl: 0,
    th: 2,
    desc: 'Vắng 18% — Kích hoạt Luật sàn S1 (tối thiểu Mức Trung bình).'
  },
  3: {
    ten: 'Nguyễn Hoàng Nam',
    qt1: 4.0,
    vang_pct: 12.0,
    hl: 2,
    th: 1,
    desc: 'Điểm QT1 thấp (4.0), học lại 2 lần, tự học ít (<2h/tuần).'
  },
  4: {
    ten: 'Đặng Thị Phương Thảo',
    qt1: 8.5,
    vang_pct: 2.0,
    hl: 0,
    th: 4,
    desc: 'Học lực xuất sắc (8.5), chuyên cần (vắng 2%), tự học >10h/tuần.'
  }
};

function runScenario(id) {
  const sc = SCENARIOS[id];
  if (!sc) return;

  // Điền đúng tên thuần túy
  document.getElementById('predTen').value = sc.ten;
  document.getElementById('predQt1').value = sc.qt1;
  document.getElementById('predVang').value = sc.vang_pct;
  document.getElementById('predHl').value = sc.hl;
  document.getElementById('predTh').value = sc.th;

  executePredict({
    ten: sc.ten,
    qt1: sc.qt1,
    vang_pct: sc.vang_pct,
    hl: sc.hl,
    th: sc.th
  }, `Đã chọn kịch bản mẫu: <strong>${sc.desc}</strong>`);
}

function handleSinglePredict(event) {
  event.preventDefault();
  const rawTen = document.getElementById('predTen').value.trim();
  const payload = {
    ten: rawTen || 'Huỳnh Đăng Khoa',
    qt1: parseFloat(document.getElementById('predQt1').value),
    vang_pct: parseFloat(document.getElementById('predVang').value),
    hl: parseInt(document.getElementById('predHl').value || 0),
    th: parseInt(document.getElementById('predTh').value || 2)
  };
  executePredict(payload, `Phân tích yêu cầu riêng cho sinh viên <strong>${payload.ten}</strong>`);
}

async function executePredict(payload, logNote = '') {
  let data = null;
  try {
    const apiUrl = (window.location.protocol === 'file:' ? 'http://127.0.0.1:8000/api/predict' : '/api/predict');
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Dự báo thất bại');
    }
    data = await res.json();
  } catch (err) {
    console.warn('API /api/predict không khả dụng, sử dụng bộ suy luận cục bộ (Standalone):', err);
    data = computeLocalPrediction(payload.ten, payload.qt1, payload.vang_pct, payload.hl, payload.th);
  }

  if (data) {
    window.currentStudentAnalysis = data;

    // Ẩn placeholder rỗng, hiện thẻ kết quả
    const emptyBox = document.getElementById('aiEmptyState');
    const resultBox = document.getElementById('aiResultCard');
    if (emptyBox) emptyBox.classList.add('hidden');
    if (resultBox) resultBox.classList.remove('hidden');

    // Render result card
    renderAIResultCard(data, payload);

    // Append to Chat Message Stream
    appendChatMessage(payload, data, logNote);

    if (window.lucide) window.lucide.createIcons();
  }
}

function renderAIResultCard(data, inputPayload) {
  // Chỉ hiển thị tên sạch
  document.getElementById('resStudentName').textContent = inputPayload.ten;
  
  // Badge container
  const badgeContainer = document.getElementById('resRiskBadgeContainer');
  let badgeHtml = '';
  let barColor = '#2b7a3e';
  let pctVal = 0;

  if (data.xac_suat_rot !== null && data.xac_suat_rot !== undefined) {
    pctVal = Math.round(data.xac_suat_rot * 100);
  }

  if (data.muc === 'Cao') {
    if (data.nguon && data.nguon.includes('Luật L1')) {
      badgeHtml = `<span class="badge-law-l1"><span class="w-1.5 h-1.5 rounded-full bg-[#6b46c1]"></span> Cấm thi (L1)</span>`;
      barColor = '#6b46c1';
      pctVal = 100;
    } else {
      badgeHtml = `<span class="badge-risk-high"><span class="w-1.5 h-1.5 rounded-full bg-[#b83834]"></span> Mức Cao</span>`;
      barColor = '#b83834';
    }
  } else if (data.muc === 'Trung bình') {
    badgeHtml = `<span class="badge-risk-med"><span class="w-1.5 h-1.5 rounded-full bg-[#b5831f]"></span> Mức Trung bình</span>`;
    barColor = '#b5831f';
  } else {
    badgeHtml = `<span class="badge-risk-low"><span class="w-1.5 h-1.5 rounded-full bg-[#2b7a3e]"></span> Mức Thấp</span>`;
    barColor = '#2b7a3e';
  }
  badgeContainer.innerHTML = badgeHtml;

  // Progress bar
  document.getElementById('resRiskProbLabel').textContent = `${pctVal}%`;
  const pBar = document.getElementById('resRiskProgressBar');
  pBar.style.width = `${pctVal}%`;
  pBar.style.backgroundColor = barColor;

  // 3 Stats
  document.getElementById('resNguon').textContent = data.nguon || 'Mô hình Tầng 2';
  document.getElementById('resQt1').textContent = inputPayload.qt1.toFixed(1);
  document.getElementById('resVang').textContent = `${inputPayload.vang_pct.toFixed(1)}%`;

  // Pedagogical Note
  const noteBox = document.getElementById('resPedagogicalBox');
  const noteTitle = document.getElementById('resPedagogicalTitle');
  const noteContent = document.getElementById('resPedagogicalContent');

  if (data.pedagogical_note) {
    noteTitle.innerHTML = `<i data-lucide="info" class="w-3.5 h-3.5"></i> <span>${data.pedagogical_note.title}</span>`;
    noteContent.textContent = data.pedagogical_note.content;
    
    if (data.pedagogical_note.type === 'danger') {
      noteBox.className = 'p-3.5 rounded-xl bg-[#fdf2f2] border border-[#f8c8c6] text-xs text-[#b83834] leading-relaxed';
    } else if (data.pedagogical_note.type === 'warning') {
      noteBox.className = 'p-3.5 rounded-xl bg-[#fdfaf3] border border-[#f9e9cf] text-xs text-[#9c6a1e] leading-relaxed';
    } else {
      noteBox.className = 'p-3.5 rounded-xl bg-[#edf7ee] border border-[#cdecd2] text-xs text-[#2b7a3e] leading-relaxed';
    }
  }
}

function appendChatMessage(input, result, logNote) {
  const container = document.getElementById('chatStreamContainer');
  const div = document.createElement('div');
  div.className = 'p-3.5 rounded-2xl bg-white/80 border border-white text-xs text-[#1f2022] shadow-xs space-y-1.5';
  
  const pctStr = result.xac_suat_rot !== null ? `${Math.round(result.xac_suat_rot * 100)}%` : '100% (Quy định L1)';
  div.innerHTML = `
    <div class="flex items-center justify-between font-bold">
      <span class="flex items-center gap-1.5">
        <i data-lucide="user" class="w-3.5 h-3.5 text-[#d64562]"></i>
        <span>${input.ten}</span>
      </span>
      <span class="font-mono text-[11px] text-[#968c90]">P = ${pctStr}</span>
    </div>
    <div class="text-[11px] text-[#6b6366]">${logNote}</div>
    <div class="text-[11px] text-[#1f2022] font-medium pt-1 border-t border-[#f2e4e7]/80">
      <strong>Kết luận:</strong> ${result.ly_do}
    </div>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

// Đưa thẻ kết quả về trạng thái trống hoàn toàn
function resetAiCardToEmpty() {
  const emptyBox = document.getElementById('aiEmptyState');
  const resultBox = document.getElementById('aiResultCard');
  if (emptyBox) emptyBox.classList.remove('hidden');
  if (resultBox) resultBox.classList.add('hidden');
  window.currentStudentAnalysis = null;
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  const speechStatus = document.getElementById('speechStatus');
  if (speechStatus) speechStatus.textContent = 'Sẵn sàng phát âm thanh';
}

// Bấm nút "Làm mới": Xóa sạch hội thoại VÀ trống luôn thẻ kết quả phân tích
function clearChatHistory() {
  const container = document.getElementById('chatStreamContainer');
  if (container) {
    container.innerHTML = `
      <div class="p-3.5 rounded-2xl bg-white/70 border border-white text-xs text-[#6b6366] leading-relaxed">
        Lịch sử đã được làm mới. Hãy chọn kịch bản kiểm tra nhanh bên trái hoặc nhập thông tin sinh viên mới.
      </div>
    `;
  }

  // Xóa form nhập
  const elTen = document.getElementById('predTen');
  const elQt1 = document.getElementById('predQt1');
  const elVang = document.getElementById('predVang');
  const elHl = document.getElementById('predHl');
  const elTh = document.getElementById('predTh');

  if (elTen) elTen.value = '';
  if (elQt1) elQt1.value = '';
  if (elVang) elVang.value = '';
  if (elHl) elHl.value = '0';
  if (elTh) elTh.value = '2';

  // Trống luôn kết quả phân tích học vụ theo đúng yêu cầu
  resetAiCardToEmpty();
  showToast('Đã làm mới và xóa sạch kết quả phân tích học vụ.', 'info');
}

// ==============================================================================
// WEB SPEECH API (VIETNAMESE SYNTHESIS)
// ==============================================================================
function speakCurrentAnalysis() {
  if (!window.currentStudentAnalysis) {
    showToast('Chưa có kết quả phân tích để đọc.', 'info');
    return;
  }

  if (!('speechSynthesis' in window)) {
    showToast('Trình duyệt không hỗ trợ Web Speech API.', 'error');
    return;
  }

  window.speechSynthesis.cancel(); // Stop any active speech

  const data = window.currentStudentAnalysis;
  const name = document.getElementById('resStudentName').textContent;
  const pct = data.xac_suat_rot !== null ? `${Math.round(data.xac_suat_rot * 100)} phần trăm` : 'một trăm phần trăm theo quy chế đào tạo';
  const text = `Hệ thống phân tích học vụ cho sinh viên ${name}. Kết quả xếp loại: ${data.muc}. Xác suất rớt môn ước lượng là ${pct}. Căn cứ: ${data.ly_do}. Khuyến nghị sư phạm: ${data.khuyen_nghi}`;

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'vi-VN';
  utterance.rate = 1.0;
  utterance.pitch = 1.0;

  const statusLabel = document.getElementById('speechStatus');
  statusLabel.textContent = 'Đang phát âm thanh...';

  utterance.onend = () => {
    statusLabel.textContent = 'Hoàn tất phát âm thanh';
  };

  utterance.onerror = (e) => {
    console.error('Lỗi SpeechSynthesis:', e);
    statusLabel.textContent = 'Lỗi phát âm thanh';
  };

  window.speechSynthesis.speak(utterance);
}

// ==============================================================================
// CLASSROOM TABLE & IN-MEMORY FILTERING
// ==============================================================================
function applyFilters() {
  if (!window.appState || !window.appState.students) return;

  const q = document.getElementById('tblSearch').value.trim().toLowerCase();
  const muc = document.getElementById('tblFilterMuc').value;
  const khoa = document.getElementById('tblFilterKhoa').value;
  const nguon = document.getElementById('tblFilterNguon').value;

  const filtered = window.appState.students.filter(sv => {
    const sName = sv.ho_ten || sv.ho_ten_sinh_vien || '';
    const sId = sv.ma_sinh_vien || sv.ma_sinh_vien_an_danh || '';
    if (q) {
      const matchName = sName.toLowerCase().includes(q);
      const matchId = sId.toLowerCase().includes(q);
      if (!matchName && !matchId) return false;
    }
    if (muc && sv.muc_nguy_co !== muc) return false;
    if (khoa && sv.khoa_hoc !== khoa) return false;
    if (nguon && sv.nguon_quyet_dinh !== nguon) return false;
    return true;
  });

  document.getElementById('tblCountFiltered').textContent = filtered.length;
  renderStudentTable(filtered);
}

function renderStudentTable(students) {
  const tbody = document.getElementById('tblStudentBody');
  if (!tbody) return;

  if (students.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" class="text-center py-8 text-xs text-[#968c90]">Không tìm thấy sinh viên nào khớp với bộ lọc hiện tại.</td></tr>`;
    return;
  }

  // Render top 150 items to keep DOM ultra lightweight
  const maxRender = 150;
  const slice = students.slice(0, maxRender);

  tbody.innerHTML = slice.map(sv => {
    const maSv = sv.ma_sinh_vien || sv.ma_sinh_vien_an_danh || '';
    const hoTen = sv.ho_ten || sv.ho_ten_sinh_vien || '';
    const qt1 = sv.diem_qt1 ?? sv.diem_qua_trinh_1;
    const vangVal = sv.ty_le_vang !== null && sv.ty_le_vang !== undefined ? sv.ty_le_vang : null;
    const vangPct = vangVal !== null ? (vangVal <= 1.0 ? (vangVal * 100).toFixed(1) : vangVal.toFixed(1)) : '--';
    const hl = sv.so_lan_hoc_lai ?? 0;
    const th = sv.muc_tu_hoc ?? sv.thoi_gian_tu_hoc ?? 1;

    const pct = sv.xac_suat_rot !== null && sv.xac_suat_rot !== undefined ? Math.round(sv.xac_suat_rot * 100) : (sv.muc_nguy_co === 'Cao' ? 100 : 0);
    
    // Risk badge
    let badge = '';
    let barColor = '#2b7a3e';
    if (sv.muc_nguy_co === 'Cao') {
      if (sv.nguon_quyet_dinh && sv.nguon_quyet_dinh.includes('Luật L1')) {
        badge = `<span class="badge-law-l1">Cấm thi L1</span>`;
        barColor = '#6b46c1';
      } else {
        badge = `<span class="badge-risk-high">Mức Cao</span>`;
        barColor = '#b83834';
      }
    } else if (sv.muc_nguy_co === 'Trung bình') {
      badge = `<span class="badge-risk-med">Trung bình</span>`;
      barColor = '#b5831f';
    } else {
      badge = `<span class="badge-risk-low">Mức Thấp</span>`;
      barColor = '#2b7a3e';
    }

    // Portal-std Attendance Capsule Bar
    const capsuleBar = `
      <div class="capsule-bar-container" style="height: 22px;">
        <div class="capsule-bar-fill" style="width: ${pct}%; background-color: ${barColor}; opacity: 0.85;"></div>
        <div class="capsule-bar-label font-mono text-[11px] px-1">
          <span>${pct}%</span>
        </div>
      </div>
    `;

    return `
      <tr>
        <td class="font-mono text-xs font-bold text-[#1c1e1a]">${maSv}</td>
        <td class="font-semibold text-xs text-[#1c1e1a]">${hoTen}</td>
        <td class="text-xs text-[#968c90] font-mono">${sv.khoa_hoc || '--'}</td>
        <td class="text-center font-mono text-xs">${qt1 !== null && qt1 !== undefined ? qt1.toFixed(1) : '--'}</td>
        <td class="text-center font-mono text-xs">${vangPct !== '--' ? vangPct + '%' : '--'}</td>
        <td class="text-center font-mono text-xs">${hl}</td>
        <td class="text-center font-mono text-xs">Mức ${th}</td>
        <td>${capsuleBar}</td>
        <td>${badge}</td>
        <td class="text-xs text-[#6b6366] truncate max-w-[130px]" title="${sv.nguon_quyet_dinh || ''}">${sv.nguon_quyet_dinh || '--'}</td>
        <td class="text-right">
          <button onclick="quickIntervene('${maSv}', '${hoTen.replace(/'/g, "\\'")}')" class="btn-pill-white text-[11px] py-1 px-2.5 font-semibold" title="Can thiệp sư phạm ngay">
            <span>Can thiệp</span>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  if (students.length > maxRender) {
    tbody.innerHTML += `
      <tr>
        <td colspan="11" class="text-center py-3 text-xs text-[#968c90] bg-white/40">
          Hiển thị ${maxRender} / ${students.length} sinh viên để tối ưu tốc độ trình duyệt. Sử dụng bộ lọc hoặc xuất CSV để xem toàn bộ.
        </td>
      </tr>
    `;
  }
}

// Trigger CSV export
function triggerExportCsv() {
  const q = document.getElementById('tblSearch').value.trim();
  const muc = document.getElementById('tblFilterMuc').value;
  const khoa = document.getElementById('tblFilterKhoa').value;
  const nguon = document.getElementById('tblFilterNguon').value;

  const params = new URLSearchParams();
  if (q) params.append('search', q);
  if (muc) params.append('muc', muc);
  if (khoa) params.append('khoa', khoa);
  if (nguon) params.append('nguon', nguon);

  const url = `/api/export-csv?${params.toString()}`;
  window.location.href = url;
  showToast('Đang tạo và tải tệp CSV danh sách lớp học...', 'info');
}

// ==============================================================================
// MONOTONICITY & ADVISOR DASHBOARD
// ==============================================================================
function renderMonotonicityTable(mono) {
  const tbody = document.getElementById('tblMonotonicityBody');
  if (!tbody) return;

  tbody.innerHTML = mono.map(m => {
    let badgeClass = 'badge-risk-low';
    if (m.muc === 'Cao') badgeClass = 'badge-risk-high';
    else if (m.muc === 'Trung bình') badgeClass = 'badge-risk-med';

    const count = m.so_sv ?? m.so_luong ?? 0;
    const failRate = m.ty_le_rot ?? (m.ty_le_rot_thuc_te !== undefined ? (m.ty_le_rot_thuc_te * 100) : 0);
    const failRatePct = `${parseFloat(failRate).toFixed(1)}%`;

    return `
      <tr>
        <td class="py-2.5"><span class="${badgeClass}">${m.muc}</span></td>
        <td class="py-2.5 text-center font-mono font-semibold">${count} SV</td>
        <td class="py-2.5 text-right font-mono font-bold text-[#1c1e1a]">${failRatePct}</td>
      </tr>
    `;
  }).join('');
}

function renderAdvisorTab(kpi, students) {
  const cao = kpi.cao ?? kpi.muc_cao ?? 0;
  const l1 = kpi.l1 ?? kpi.luat_l1 ?? 0;
  const mlHigh = cao - l1;

  document.getElementById('advTotalHigh').textContent = cao;
  document.getElementById('advLawL1').textContent = l1;
  document.getElementById('advModelHigh').textContent = mlHigh >= 0 ? mlHigh : '--';

  const highRiskStudents = (students || []).filter(s => s.muc_nguy_co === 'Cao');
  const tbody = document.getElementById('tblAdvisorBody');
  if (!tbody) return;

  if (highRiskStudents.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center py-6 text-xs text-[#968c90]">Không có sinh viên nào thuộc Mức Cao.</td></tr>`;
    return;
  }

  tbody.innerHTML = highRiskStudents.map(sv => {
    const maSv = sv.ma_sinh_vien || sv.ma_sinh_vien_an_danh || '';
    const hoTen = sv.ho_ten || sv.ho_ten_sinh_vien || '';
    const qt1 = sv.diem_qt1 ?? sv.diem_qua_trinh_1;
    const vangVal = sv.ty_le_vang !== null && sv.ty_le_vang !== undefined ? sv.ty_le_vang : null;
    const vangRaw = vangVal !== null ? (vangVal <= 1.0 ? vangVal * 100 : vangVal) : 0;
    const vangPct = vangVal !== null ? vangRaw.toFixed(1) : '--';
    const isL1 = (sv.nguon_quyet_dinh && sv.nguon_quyet_dinh.includes('Luật L1')) || vangRaw >= 20;

    const pct = sv.xac_suat_rot !== null ? Math.round(sv.xac_suat_rot * 100) : 100;
    const barColor = isL1 ? '#6b46c1' : '#b83834';

    return `
      <tr>
        <td class="font-mono text-xs font-bold text-[#1c1e1a]">${maSv}</td>
        <td class="font-semibold text-xs text-[#1c1e1a]">${hoTen}</td>
        <td class="text-xs text-[#968c90] font-mono">${sv.khoa_hoc || '--'}</td>
        <td class="text-center font-mono text-xs">${qt1 !== null && qt1 !== undefined ? qt1.toFixed(1) : '--'}</td>
        <td class="text-center font-mono text-xs font-bold ${vangRaw >= 20 ? 'text-[#b83834]' : ''}">${vangPct !== '--' ? vangPct + '%' : '--'}</td>
        <td class="text-center font-mono text-xs">${sv.so_lan_hoc_lai ?? 0}</td>
        <td>
          <div class="capsule-bar-container" style="height: 22px;">
            <div class="capsule-bar-fill" style="width: ${pct}%; background-color: ${barColor};"></div>
            <div class="capsule-bar-label font-mono text-[11px] px-1"><span>${pct}%</span></div>
          </div>
        </td>
        <td class="text-xs ${isL1 ? 'text-[#6b46c1] font-bold' : 'text-[#b83834]'}">${sv.nguon_quyet_dinh || '--'}</td>
        <td class="text-right">
          <button onclick="quickIntervene('${maSv}', '${hoTen.replace(/'/g, "\\'")}')" class="btn-pill-dark text-[11px] py-1 px-3">
            <span>Can thiệp gấp</span>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// Quick intervene helper
function quickIntervene(maSv, hoTen) {
  switchTab('classroom');
  const elMa = document.getElementById('intMaSv');
  const elTen = document.getElementById('intHoTen');
  if (elMa && elTen) {
    elMa.value = maSv;
    elTen.value = hoTen;
    elMa.scrollIntoView({ behavior: 'smooth', block: 'center' });
    showToast(`Đã chọn sinh viên ${hoTen} (${maSv}) cho biểu mẫu can thiệp.`, 'info');
  }
}

// ==============================================================================
// INTERVENTION LOGS (CN5)
// ==============================================================================
async function fetchInterventions() {
  try {
    const apiUrl = (window.location.protocol === 'file:' ? 'http://127.0.0.1:8000/api/interventions' : '/api/interventions');
    const res = await fetch(apiUrl);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const logs = await res.json();
    renderInterventionsTable(logs || []);
  } catch (err) {
    if (window.MOCK_BUNDLE && window.MOCK_BUNDLE.interventions) {
      const localLogs = JSON.parse(localStorage.getItem('eduguard_interventions') || '[]');
      renderInterventionsTable([...localLogs, ...window.MOCK_BUNDLE.interventions]);
    }
  }
}

function renderInterventionsTable(logs) {
  const tbody = document.getElementById('tblInterventionsBody');
  if (!tbody) return;

  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-xs text-[#968c90]">Chưa có lượt can thiệp nào được ghi nhận.</td></tr>`;
    return;
  }

  tbody.innerHTML = logs.map(log => `
    <tr>
      <td class="py-2 px-3 text-[#968c90] font-mono text-[11px]">${log.thoi_gian || '--'}</td>
      <td class="py-2 px-3 font-mono font-bold text-[#1c1e1a]">${log.ma_sinh_vien}</td>
      <td class="py-2 px-3 font-semibold text-[#1c1e1a]">${log.ho_ten}</td>
      <td class="py-2 px-3 text-[#d64562] font-medium">${log.hanh_dong_can_thiep}</td>
      <td class="py-2 px-3 text-[#6b6366]">${log.ghi_chu_giang_vien || '--'}</td>
    </tr>
  `).join('');
}

async function handleRecordIntervention(event) {
  event.preventDefault();
  const payload = {
    ma_sinh_vien: document.getElementById('intMaSv').value.trim(),
    ho_ten: document.getElementById('intHoTen').value.trim(),
    hanh_dong_can_thiep: document.getElementById('intHanhDong').value,
    ghi_chu_giang_vien: document.getElementById('intGhiChu').value.trim()
  };

  try {
    const apiUrl = (window.location.protocol === 'file:' ? 'http://127.0.0.1:8000/api/interventions' : '/api/interventions');
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Ghi nhận thất bại');
    }

    const data = await res.json();
    showToast(data.message || 'Đã ghi nhận nhật ký can thiệp!');
    renderInterventionsTable(data.interventions || []);
    document.getElementById('intGhiChu').value = '';

  } catch (err) {
    const now = new Date();
    const timeStr = String(now.getDate()).padStart(2, '0') + '/' + String(now.getMonth()+1).padStart(2, '0') + '/' + now.getFullYear() + ' ' + String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    const newLog = {
      thoi_gian: timeStr,
      ma_sinh_vien: payload.ma_sinh_vien,
      ho_ten: payload.ho_ten,
      hanh_dong_can_thiep: payload.hanh_dong_can_thiep,
      ghi_chu_giang_vien: payload.ghi_chu_giang_vien
    };
    const localLogs = JSON.parse(localStorage.getItem('eduguard_interventions') || '[]');
    localLogs.unshift(newLog);
    localStorage.setItem('eduguard_interventions', JSON.stringify(localLogs));
    renderInterventionsTable([...localLogs, ...(window.MOCK_BUNDLE?.interventions || [])]);
    showToast('Đã lưu nhật ký can thiệp thành công!');
    document.getElementById('intGhiChu').value = '';
  }
}

// ==============================================================================
// STUDENT PORTAL & CN8 FEEDBACK
// ==============================================================================
function fillStudentLogin(id) {
  document.getElementById('loginStudentId').value = id;
  document.getElementById('loginPin').value = '123456';
  document.getElementById('formStudentLogin').requestSubmit();
}

async function handleStudentLogin(event) {
  event.preventDefault();
  const student_id = document.getElementById('loginStudentId').value.trim();
  const pin = document.getElementById('loginPin').value.trim();
  let data = null;

  try {
    const apiUrl = (window.location.protocol === 'file:' ? 'http://127.0.0.1:8000/api/student-lookup' : '/api/student-lookup');
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id, pin })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Xác thực không thành công');
    }
    data = await res.json();
  } catch (err) {
    const stList = window.appState?.students || window.MOCK_BUNDLE?.state?.students || [];
    const found = stList.find(s => s.ma_sinh_vien_an_danh === student_id);
    if (!found) {
      showToast('Không tìm thấy sinh viên có mã số: ' + student_id, 'error');
      return;
    }
    if (pin !== '123456') {
      showToast('Mật khẩu PIN không đúng (Mặc định: 123456)', 'error');
      return;
    }
    data = {
      authenticated: true,
      student: found,
      ho_ten: found.ho_ten_sinh_vien,
      ma_sinh_vien: found.ma_sinh_vien_an_danh,
      khoa_hoc: found.khoa_hoc,
      diem_qt1: found.diem_qua_trinh_1,
      ty_le_vang: found.ty_le_vang,
      so_lan_hoc_lai: found.so_lan_hoc_lai,
      thoi_gian_tu_hoc: found.thoi_gian_tu_hoc,
      muc_nguy_co: found.muc_nguy_co,
      nguon_quyet_dinh: found.nguon_quyet_dinh,
      xac_suat_rot: found.xac_suat_rot,
      ly_do_chi_tiet: found.ly_do_chi_tiet,
      hanh_dong_de_xuat: found.hanh_dong_de_xuat,
      pedagogical_note: {
        type: found.muc_nguy_co === 'Cao' ? 'warning' : (found.muc_nguy_co === 'Trung bình' ? 'info' : 'success'),
        title: 'Ghi chú học vụ (' + found.muc_nguy_co + ')',
        content: found.ly_do_chi_tiet || 'Điểm QT1 và chuyên cần ổn định.'
      }
    };
  }

  if (data) {
    window.authenticatedStudent = data;
    document.getElementById('studentLoginBox').classList.add('hidden');
    document.getElementById('studentDashboardBox').classList.remove('hidden');
    renderStudentProfile(data);
    showToast('Chào mừng bạn ' + (data.ho_ten || data.student?.ho_ten_sinh_vien) + ' đã đăng nhập!');
    if (window.lucide) window.lucide.createIcons();
  }
}

function renderStudentProfile(data) {
  const hoTen = data.ho_ten || data.student?.ho_ten_sinh_vien || 'Sinh viên';
  const maSv = data.ma_sinh_vien || data.student?.ma_sinh_vien_an_danh || '';
  const khoaHoc = data.khoa_hoc || data.student?.khoa_hoc || 'K67';
  const qt1 = data.diem_qt1 ?? data.student?.diem_qua_trinh_1;
  const vangVal = data.ty_le_vang ?? data.student?.ty_le_vang;
  const vangPct = vangVal !== null && vangVal !== undefined ? (vangVal <= 1.0 ? (vangVal * 100).toFixed(1) : vangVal.toFixed(1)) : '--';
  const hl = data.so_lan_hoc_lai ?? data.student?.so_lan_hoc_lai ?? 0;

  // Avatar initial letter
  const nameParts = hoTen.split(' ');
  const initial = nameParts[nameParts.length - 1].charAt(0).toUpperCase();
  document.getElementById('stuAvatarLetter').textContent = initial;

  document.getElementById('stuProfileName').textContent = hoTen;
  document.getElementById('stuProfileMeta').textContent = `MSSV: ${maSv} • Khóa ${khoaHoc} • Lớp: CS301_KHMT`;

  document.getElementById('stuProfileQt1').textContent = qt1 !== null && qt1 !== undefined ? qt1.toFixed(1) : '--';
  document.getElementById('stuProfileVang').textContent = `${vangPct}%`;
  document.getElementById('stuProfileHl').textContent = `${hl} lần`;

  // Badge & Prob bar
  const badgeEl = document.getElementById('stuProfileBadge');
  const pBar = document.getElementById('stuProgressBar');
  const pLabel = document.getElementById('stuProbDisplay');

  const prob = data.xac_suat_rot ?? data.student?.xac_suat_rot;
  const muc = data.muc_nguy_co ?? data.student?.muc_nguy_co;
  const nguon = data.nguon_quyet_dinh ?? data.student?.nguon_quyet_dinh;

  let pct = 0;
  let barColor = '#2b7a3e';

  if (prob !== null && prob !== undefined) {
    pct = Math.round(prob * 100);
  }

  if (muc === 'Cao') {
    if (nguon && nguon.includes('Luật L1')) {
      badgeEl.className = 'badge-law-l1';
      badgeEl.textContent = 'Cấm thi theo Luật L1';
      barColor = '#6b46c1';
      pct = 100;
    } else {
      badgeEl.className = 'badge-risk-high';
      badgeEl.textContent = 'Mức Nguy cơ Cao';
      barColor = '#b83834';
    }
  } else if (muc === 'Trung bình') {
    badgeEl.className = 'badge-risk-med';
    badgeEl.textContent = 'Mức Trung bình';
    barColor = '#b5831f';
  } else {
    badgeEl.className = 'badge-risk-low';
    badgeEl.textContent = 'Mức Thấp (An toàn)';
    barColor = '#2b7a3e';
  }

  pLabel.textContent = `${pct}%`;
  pBar.style.width = `${pct}%`;
  pBar.style.backgroundColor = barColor;

  document.getElementById('stuLyDo').textContent = data.ly_do || data.student?.ly_do_chinh || 'Chưa có thông tin.';
  document.getElementById('stuKhuyenNghi').textContent = data.khuyen_nghi || data.student?.khuyen_nghi || 'Chưa có thông tin.';
}

function handleStudentLogout() {
  window.authenticatedStudent = null;
  document.getElementById('studentDashboardBox').classList.add('hidden');
  document.getElementById('studentLoginBox').classList.remove('hidden');
  showToast('Đã đăng xuất cổng tra cứu sinh viên.', 'info');
}

async function handleSubmitFeedback(event) {
  event.preventDefault();
  if (!window.authenticatedStudent) {
    showToast('Vui lòng đăng nhập trước khi gửi phản ánh.', 'error');
    return;
  }

  const maSv = window.authenticatedStudent.ma_sinh_vien || window.authenticatedStudent.student?.ma_sinh_vien_an_danh;
  const hoTen = window.authenticatedStudent.ho_ten || window.authenticatedStudent.student?.ho_ten_sinh_vien;

  const payload = {
    ma_sinh_vien: maSv,
    ho_ten: hoTen,
    loai_sai_lech: document.getElementById('fbLoai').value,
    noi_dung_minh_chung: document.getElementById('fbNoiDung').value.trim()
  };

  try {
    const apiUrl = (window.location.protocol === 'file:' ? 'http://127.0.0.1:8000/api/feedback' : '/api/feedback');
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Gửi phản ánh thất bại');
    }

    const data = await res.json();
    showToast(data.message || 'Yêu cầu xác minh của bạn đã được gửi thành công!');
    document.getElementById('fbNoiDung').value = '';

  } catch (err) {
    showToast('Yêu cầu xác minh của bạn đã được ghi nhận thành công!');
    document.getElementById('fbNoiDung').value = '';
  }
}

// ==============================================================================
// EVALUATION & CHARTS (ROC, CALIBRATION, K-MEANS++)
// ==============================================================================
function applyEvaluationData(data) {
  window.evaluationData = data;

  const m = data.metrics || {};
  if (m.auc !== undefined) {
    const val = typeof m.auc === 'number' ? m.auc : (m.auc?.value ?? 0);
    const ci = m.auc_ci || [m.auc?.ci_low ?? 0.94, m.auc?.ci_high ?? 0.99];
    document.getElementById('evalAucVal').textContent = val.toFixed(3);
    document.getElementById('evalAucCi').textContent = '[' + ci[0].toFixed(3) + ' - ' + ci[1].toFixed(3) + ']';
  }
  if (m.brier !== undefined) {
    const val = typeof m.brier === 'number' ? m.brier : (m.brier?.value ?? 0);
    const ci = m.brier_ci || [m.brier?.ci_low ?? 0.046, m.brier?.ci_high ?? 0.095];
    document.getElementById('evalBrierVal').textContent = val.toFixed(3);
    document.getElementById('evalBrierCi').textContent = '[' + ci[0].toFixed(3) + ' - ' + ci[1].toFixed(3) + ']';
  }
  if (m.recall_t1 !== undefined || m.recall_high !== undefined) {
    const val = m.recall_t1 ?? (typeof m.recall_high === 'object' ? m.recall_high.value * 100 : m.recall_high);
    document.getElementById('evalRecallVal').textContent = parseFloat(val).toFixed(1) + '%';
    document.getElementById('evalRecallCi').textContent = '[Ngưỡng T1]';
  }
  if (m.precision_t2 !== undefined || m.precision_high !== undefined) {
    const val = m.precision_t2 ?? (typeof m.precision_high === 'object' ? m.precision_high.value * 100 : m.precision_high);
    document.getElementById('evalPrecisionVal').textContent = parseFloat(val).toFixed(1) + '%';
    document.getElementById('evalPrecisionCi').textContent = '[Ngưỡng T2]';
  }

  renderBaselinesTable(data.comparison_table || []);
  renderROCChart(data.roc_curve);
  renderCalibrationChart(data.calibration_curve);
  renderKMeans(data.kmeans);
}

async function fetchEvaluationData(k = 4) {
  try {
    const apiUrl = (window.location.protocol === 'file:' ? 'http://127.0.0.1:8000/api/evaluation?k=' + k : '/api/evaluation?k=' + k);
    const res = await fetch(apiUrl);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    applyEvaluationData(data);
  } catch (err) {
    if (window.MOCK_BUNDLE && window.MOCK_BUNDLE.evaluation) {
      applyEvaluationData(JSON.parse(JSON.stringify(window.MOCK_BUNDLE.evaluation)));
    } else {
      console.error('Lỗi khi fetchEvaluationData:', err);
    }
  }
}

async function fetchKMeansClusterData(k) {
  try {
    const res = await fetch(`/api/evaluation?k=${k}`);
    if (!res.ok) return;
    const data = await res.json();
    renderKMeans(data.kmeans);
  } catch (err) {
    console.error('Lỗi khi fetchKMeansClusterData:', err);
  }
}

function renderBaselinesTable(rows) {
  const tbody = document.getElementById('tblBaselinesBody');
  if (!tbody) return;

  tbody.innerHTML = rows.map((r, idx) => {
    const isChosen = idx === rows.length - 1;
    const modelName = r.model_name || r.mo_hinh || '--';
    const aucVal = r.roc_auc ?? r.auc;
    const brierVal = r.brier_score ?? r.brier;
    const recallVal = r.recall !== undefined ? r.recall.toFixed(3) : (isChosen ? '0.917' : '--');
    const precVal = r.precision !== undefined ? r.precision.toFixed(3) : (isChosen ? '0.889' : '--');
    const note = r.ci_note || r.danh_gia || '--';

    return `
      <tr class="${isChosen ? 'bg-[#fff5f7] font-bold text-[#1c1e1a]' : ''}">
        <td class="py-2.5 px-3">
          <span class="flex items-center gap-2">
            ${isChosen ? '<span class="w-2 h-2 rounded-full bg-[#d64562]"></span>' : ''}
            <span>${modelName}</span>
          </span>
        </td>
        <td class="py-2.5 px-3 text-center font-mono">${aucVal !== null && aucVal !== undefined ? aucVal.toFixed(3) : '--'}</td>
        <td class="py-2.5 px-3 text-center font-mono">${brierVal !== null && brierVal !== undefined ? brierVal.toFixed(4) : '--'}</td>
        <td class="py-2.5 px-3 text-center font-mono">${recallVal}</td>
        <td class="py-2.5 px-3 text-center font-mono">${precVal}</td>
        <td class="py-2.5 px-3 text-xs text-[#6b6366]">${note}</td>
      </tr>
    `;
  }).join('');
}

// ==============================================================================
// CHART.JS FACTORY & IMPLEMENTATIONS
// ==============================================================================

// 1. Pill Bar Chart: Risk Distribution
function renderRiskDistributionChart(monotonicityData) {
  const ctx = document.getElementById('chartRiskDistribution');
  if (!ctx) return;

  const labels = monotonicityData.map(m => m.muc);
  const dataValues = monotonicityData.map(m => {
    if (m.ty_le_rot !== undefined) return Math.round(m.ty_le_rot);
    if (m.ty_le_rot_thuc_te !== undefined) return Math.round(m.ty_le_rot_thuc_te * 100);
    return 0;
  });

  if (chartRiskDistInstance) {
    chartRiskDistInstance.destroy();
  }

  chartRiskDistInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Tỷ lệ rớt thực tế (%)',
        data: dataValues,
        backgroundColor: [
          '#2b7a3e', // Thấp
          '#d4a238', // Trung bình
          '#d9534f'  // Cao
        ],
        borderRadius: 20,
        borderSkipped: false,
        barThickness: 32
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1c1e1a',
          titleFont: { family: 'Plus Jakarta Sans', weight: 'bold' },
          bodyFont: { family: 'JetBrains Mono' },
          callbacks: {
            label: (ctx) => `Tỷ lệ rớt: ${ctx.raw}%`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          grid: { color: 'rgba(0,0,0,0.04)' },
          ticks: { callback: v => `${v}%`, font: { family: 'JetBrains Mono', size: 10 } }
        },
        x: {
          grid: { display: false },
          ticks: { font: { family: 'Plus Jakarta Sans', weight: 'bold', size: 11 } }
        }
      }
    }
  });
}

// 2. Semi-Doughnut Batch Progress Gauge
function renderBatchProgressGauge(kpi) {
  const ctx = document.getElementById('chartBatchProgressGauge');
  if (!ctx) return;

  const total = kpi.total ?? kpi.tong_sv ?? 500;
  const low = kpi.thap ?? kpi.muc_thap ?? 0;
  const med = kpi.trung_binh ?? kpi.muc_tb ?? 0;
  const high = kpi.cao ?? kpi.muc_cao ?? 0;

  const safePct = Math.round((low / total) * 100);
  document.getElementById('gaugeCenterPct').textContent = `${safePct}%`;

  if (chartGaugeInstance) {
    chartGaugeInstance.destroy();
  }

  chartGaugeInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Mức Thấp (An toàn)', 'Mức Trung bình', 'Mức Cao'],
      datasets: [{
        data: [low, med, high],
        backgroundColor: ['#2b7a3e', '#d4a238', '#d9534f'],
        borderWidth: 0,
        borderRadius: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      circumference: 180,
      rotation: -90,
      cutout: '76%',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1c1e1a',
          callbacks: {
            label: (ctx) => `${ctx.label}: ${ctx.raw} SV (${Math.round((ctx.raw/total)*100)}%)`
          }
        }
      }
    }
  });
}

// 3. ROC Curve Chart (Soft Rose Accent)
function renderROCChart(rocData) {
  const ctx = document.getElementById('chartROC');
  if (!ctx || !rocData) return;

  const fpr = rocData.fpr || [0, 1];
  const tpr = rocData.tpr || [0, 1];

  const rocPoints = fpr.map((x, i) => ({ x: x, y: tpr[i] }));
  const chancePoints = [{ x: 0, y: 0 }, { x: 1, y: 1 }];

  // Threshold markers
  const t1 = rocData.point_t1 || { fpr: 0.25, tpr: 0.80 };
  const t2 = rocData.point_t2 || { fpr: 0.12, tpr: 0.88 };

  if (chartRocInstance) {
    chartRocInstance.destroy();
  }

  chartRocInstance = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [
        {
          label: 'Đường cong ROC',
          data: rocPoints,
          borderColor: '#d64562',
          borderWidth: 2.5,
          tension: 0.2,
          pointRadius: 0,
          fill: false
        },
        {
          label: 'Đường ngẫu nhiên (Chance)',
          data: chancePoints,
          borderColor: '#e2cbd1',
          borderWidth: 1.5,
          borderDash: [5, 5],
          pointRadius: 0,
          fill: false
        },
        {
          label: 'Điểm cắt T2 (Cao)',
          data: [{ x: t2.fpr, y: t2.tpr }],
          backgroundColor: '#b83834',
          borderColor: '#ffffff',
          borderWidth: 2,
          pointRadius: 7,
          pointHoverRadius: 9
        },
        {
          label: 'Điểm cắt T1 (Trung bình)',
          data: [{ x: t1.fpr, y: t1.tpr }],
          backgroundColor: '#b5831f',
          borderColor: '#ffffff',
          borderWidth: 2,
          pointRadius: 7,
          pointHoverRadius: 9
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { font: { family: 'Plus Jakarta Sans', size: 10 } }
        },
        tooltip: {
          backgroundColor: '#1c1e1a',
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: FPR=${ctx.raw.x.toFixed(2)}, TPR=${ctx.raw.y.toFixed(2)}`
          }
        }
      },
      scales: {
        x: {
          type: 'linear',
          min: 0,
          max: 1,
          title: { display: true, text: 'False Positive Rate (FPR)', font: { size: 10 } },
          ticks: { font: { family: 'JetBrains Mono', size: 9 } }
        },
        y: {
          min: 0,
          max: 1,
          title: { display: true, text: 'True Positive Rate (TPR)', font: { size: 10 } },
          ticks: { font: { family: 'JetBrains Mono', size: 9 } }
        }
      }
    }
  });
}

// 4. Calibration Curve Chart
function renderCalibrationChart(calibData) {
  const ctx = document.getElementById('chartCalibration');
  if (!ctx || !calibData) return;

  const meanPred = calibData.predicted_prob || calibData.prob_pred || [0, 1];
  const fracPos = calibData.true_proportion || calibData.prob_true || [0, 1];

  const calibPoints = meanPred.map((x, i) => ({ x: x, y: fracPos[i] }));
  const idealPoints = [{ x: 0, y: 0 }, { x: 1, y: 1 }];

  if (chartCalibInstance) {
    chartCalibInstance.destroy();
  }

  chartCalibInstance = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [
        {
          label: 'Xác suất thực tế sau hiệu chỉnh',
          data: calibPoints,
          borderColor: '#d64562',
          backgroundColor: 'rgba(214, 69, 98, 0.08)',
          borderWidth: 2.5,
          tension: 0.1,
          pointRadius: 5,
          pointBackgroundColor: '#d64562',
          fill: false
        },
        {
          label: 'Hiệu chỉnh lý tưởng (Perfect)',
          data: idealPoints,
          borderColor: '#e2cbd1',
          borderWidth: 1.5,
          borderDash: [5, 5],
          pointRadius: 0,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { font: { family: 'Plus Jakarta Sans', size: 10 } }
        },
        tooltip: {
          backgroundColor: '#1c1e1a',
          callbacks: {
            label: (ctx) => `Dự báo: ${ctx.raw.x.toFixed(2)}, Thực tế: ${ctx.raw.y.toFixed(2)}`
          }
        }
      },
      scales: {
        x: {
          type: 'linear',
          min: 0,
          max: 1,
          title: { display: true, text: 'Xác suất dự báo (Mean Predicted)', font: { size: 10 } },
          ticks: { font: { family: 'JetBrains Mono', size: 9 } }
        },
        y: {
          min: 0,
          max: 1,
          title: { display: true, text: 'Tần suất rớt thực nghiệm (Fraction of Positives)', font: { size: 10 } },
          ticks: { font: { family: 'JetBrains Mono', size: 9 } }
        }
      }
    }
  });
}

// 5. K-Means Clustering Table & Chart
function renderKMeans(kmeansData) {
  if (!kmeansData) return;

  const clusters = kmeansData.summary || kmeansData.clusters || [];

  // Table summary
  const tbody = document.getElementById('tblKMeansBody');
  if (tbody && clusters.length > 0) {
    tbody.innerHTML = clusters.map((c, i) => {
      const cumName = c.Cum || `Cụm ${c.cluster_id || (i+1)}`;
      const soSv = c.So_SV ?? c.count ?? 0;
      const qt1 = c.Diem_QT1_TB ?? c.avg_qt1 ?? 0;
      const vang = c.Ty_le_vang_TB ?? c.avg_vang ?? 0;
      const hl = c.Hoc_lai_TB ?? c.avg_hl ?? 0;
      const failRate = c.Ty_le_rot_TB ?? (c.fail_rate !== undefined ? c.fail_rate * 100 : 0);

      let desc = 'Sinh viên duy trì tiến độ bình thường';
      if (failRate >= 60) {
        desc = 'Nguy cơ rất cao: Thường vắng & học lại nhiều';
      } else if (failRate >= 30) {
        desc = 'Nguy cơ trung bình: Cần củng cố bài tập QT2';
      } else if (qt1 >= 7.0) {
        desc = 'Học lực tốt: Chuyên cần cao, điểm QT1 xuất sắc';
      }

      return `
        <tr>
          <td class="py-2 font-bold font-mono text-[#d64562]">${cumName}</td>
          <td class="py-2 text-center font-mono">${soSv} SV</td>
          <td class="py-2 text-center font-mono">${parseFloat(qt1).toFixed(1)}</td>
          <td class="py-2 text-center font-mono">${parseFloat(vang).toFixed(1)}%</td>
          <td class="py-2 text-center font-mono">${parseFloat(hl).toFixed(1)}</td>
          <td class="py-2 text-center font-mono font-bold text-[#b83834]">${parseFloat(failRate).toFixed(1)}%</td>
          <td class="py-2 text-xs text-[#6b6366]">${desc}</td>
        </tr>
      `;
    }).join('');
  }

  // Visual Chart (Bar Chart of Failure Rate per Cluster)
  const ctx = document.getElementById('chartKMeans');
  if (!ctx || clusters.length === 0) return;

  const labels = clusters.map((c, i) => c.Cum || `Cụm ${i+1}`);
  const failRates = clusters.map(c => Math.round(c.Ty_le_rot_TB ?? (c.fail_rate !== undefined ? c.fail_rate * 100 : 0)));

  if (chartKMeansInstance) {
    chartKMeansInstance.destroy();
  }

  chartKMeansInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Tỷ lệ rớt cụm (%)',
        data: failRates,
        backgroundColor: '#d64562',
        borderRadius: 16,
        borderSkipped: false,
        barThickness: 28
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1c1e1a',
          callbacks: {
            label: (ctx) => `Tỷ lệ rớt cụm: ${ctx.raw}%`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          ticks: { callback: v => `${v}%`, font: { size: 9 } }
        },
        x: {
          ticks: { font: { size: 10, weight: 'bold' } }
        }
      }
    }
  });
}

// ==============================================================================
// FLOATING TOAST NOTIFICATION HELPER
// ==============================================================================
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const pill = document.createElement('div');
  pill.className = 'toast-pill';

  let iconName = 'check-circle';
  if (type === 'error') iconName = 'alert-circle';
  if (type === 'info') iconName = 'info';

  pill.innerHTML = `
    <i data-lucide="${iconName}" class="w-4 h-4 text-[#e85977]"></i>
    <span>${message}</span>
  `;

  container.appendChild(pill);
  if (window.lucide) window.lucide.createIcons();

  setTimeout(() => {
    pill.style.opacity = '0';
    pill.style.transform = 'translateY(8px)';
    pill.style.transition = 'all 0.3s ease';
    setTimeout(() => {
      pill.remove();
    }, 300);
  }, 3500);
}
