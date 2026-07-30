// ★ アプリ名: UQチェック（変更する場合は各HTMLの<title>とhd-titleを修正）
// ============================================================
// GAS（Google Apps Script）バックエンド接続
// ============================================================
const GAS_URL = 'https://script.google.com/macros/s/AKfycbyLt4nDzttOHvJlPtgOuQix3Gcq30S5x2KNvdD6ujCcw8Q92l4QhNWqpqgPGu-0DFVi1A/exec';

const API = {
  jsonp(params) {
    return new Promise((resolve, reject) => {
      const cb = 'cb_' + Date.now() + '_' + Math.floor(Math.random()*100000);
      const script = document.createElement('script');
      const query = new URLSearchParams({...params, callback: cb}).toString();
      script.src = GAS_URL + '?' + query;
      script.onerror = () => { delete window[cb]; reject(new Error('JSONP error')); };
      window[cb] = (data) => {
        delete window[cb];
        if (script.parentNode) document.head.removeChild(script);
        resolve(data);
      };
      document.head.appendChild(script);
      setTimeout(() => {
        if (window[cb]) { delete window[cb]; reject(new Error('timeout')); }
      }, 15000);
    });
  },
  async getStaff(garden) {
    try { const r = await this.jsonp({action:'getStaff', garden: garden||''}); return r.ok ? r.data : []; }
    catch(e) { return []; }
  },
  async getRequests(staffId, garden) {
    try { const r = await this.jsonp({action:'getRequests', staffId: staffId||'', garden: garden||''}); return r.ok ? r.data : []; }
    catch(e) { return []; }
  },
  async getPending(garden) {
    try { const r = await this.jsonp({action:'getPending', garden: garden||''}); return r.ok ? r.data : []; }
    catch(e) { return []; }
  },
  async addRequest(data) {
    try { return await this.jsonp({action:'addRequest', data: JSON.stringify(data)}); }
    catch(e) { return {ok:false, error:e.message}; }
  },
  async approveRequest(reqId, approver, garden) {
    try { return await this.jsonp({action:'approveRequest', reqId, approver, garden: garden||''}); }
    catch(e) { return {ok:false, error:e.message}; }
  },
  async rejectRequest(reqId, approver, reason, garden) {
    try { return await this.jsonp({action:'rejectRequest', reqId, approver, reason: reason||'', garden: garden||''}); }
    catch(e) { return {ok:false, error:e.message}; }
  },
};

// URLの ?garden=園名 パラメータを取得（園長画面など、園ごとにアクセスを絞りたい画面で使用）
function getUrlGarden(){
  return new URLSearchParams(location.search).get('garden');
}

// スプレッドシートから最新データを取得し、ローカルキャッシュ(localStorage)に反映する。
// 通信に失敗した場合は false を返し、既存のローカルキャッシュ（オフライン用）をそのまま使う。
let GAS_LAST_SYNC_OK = false;
async function syncFromGAS(garden) {
  try {
    const [staff, reqs] = await Promise.all([API.getStaff(garden), API.getRequests(null, garden)]);
    if (staff && staff.length) DB.saveStaff(staff);
    if (reqs) DB.saveRequests(reqs);
    GAS_LAST_SYNC_OK = true;
    return true;
  } catch(e) {
    console.warn('GAS同期失敗、ローカルキャッシュを使用します:', e);
    GAS_LAST_SYNC_OK = false;
    return false;
  }
}

// 共有データストア (localStorage) ※GAS接続前のフォールバック/デモ用データとしても機能
const DB = {
  KEY_STAFF: 'ym_staff',
  KEY_REQUESTS: 'ym_requests',

  defaultStaff: [
    {id:'EMP001',name:'山田 花子',type:'正規',hire:'2021-04-01',grant:14,carry:2,used:4,summerUsed:2,summerTotal:5,basicPay:220000,allowance:15000,avgMonthlyHours:160,email:'hanako@shiba.ed.jp'},
    {id:'EMP002',name:'田中 一郎',type:'正規',hire:'2018-04-01',grant:20,carry:0,used:5,summerUsed:5,summerTotal:5,basicPay:260000,allowance:20000,avgMonthlyHours:160,email:'ichiro@shiba.ed.jp'},
    {id:'EMP003',name:'佐藤 美咲',type:'パート',hire:'2024-04-01',grant:10,carry:3,used:1,summerUsed:0,summerTotal:0,basicPay:0,allowance:0,avgMonthlyHours:0,hourlyWage:1100,email:'misaki@shiba.ed.jp'},
    {id:'EMP004',name:'鈴木 健太',type:'正規',hire:'2020-04-01',grant:16,carry:2,used:6,summerUsed:3,summerTotal:5,basicPay:240000,allowance:18000,avgMonthlyHours:160,email:'kenta@shiba.ed.jp'},
    {id:'EMP005',name:'伊藤 明',type:'嘱託',hire:'2023-10-01',grant:11,carry:0,used:3,summerUsed:0,summerTotal:5,basicPay:200000,allowance:10000,avgMonthlyHours:160,email:'akira@shiba.ed.jp'},
    {id:'EMP006',name:'渡辺 さくら',type:'パート',hire:'2024-01-01',grant:10,carry:1,used:0,summerUsed:0,summerTotal:0,basicPay:0,allowance:0,avgMonthlyHours:0,hourlyWage:1050,email:'sakura@shiba.ed.jp'},
  ],

  defaultRequests: [
    {id:'REQ001',staffId:'EMP002',name:'田中 一郎',date:'2026-06-10',type:'全日',days:1,memo:'',status:'承認済',approver:'園長 鈴木',approvedAt:'2026-06-05 14:20',rejectedReason:'',createdAt:'2026-06-05 09:12',category:'有給'},
    {id:'REQ002',staffId:'EMP004',name:'鈴木 健太',date:'2026-06-20',type:'午前半休',days:0.5,memo:'通院のため',status:'承認済',approver:'園長 鈴木',approvedAt:'2026-06-12 16:00',rejectedReason:'',createdAt:'2026-06-12 14:30',category:'有給'},
  ],

  init(){
    if(!localStorage.getItem(this.KEY_STAFF)) localStorage.setItem(this.KEY_STAFF, JSON.stringify(this.defaultStaff));
    if(!localStorage.getItem(this.KEY_REQUESTS)) localStorage.setItem(this.KEY_REQUESTS, JSON.stringify(this.defaultRequests));
    // 既存データに新フィールドがなければマージ
    const staff = this.getStaff();
    let updated = false;
    staff.forEach(s => {
      if(s.summerUsed === undefined){ s.summerUsed = 0; updated = true; }
      if(s.summerTotal === undefined){ s.summerTotal = s.type==='正規'||s.type==='嘱託' ? 5 : 0; updated = true; }
      if(s.basicPay === undefined){ s.basicPay = 0; updated = true; }
      if(s.allowance === undefined){ s.allowance = 0; updated = true; }
      if(s.avgMonthlyHours === undefined){ s.avgMonthlyHours = 160; updated = true; }
      if(s.category === undefined){ s.category = '有給'; updated = true; }
    });
    if(updated) this.saveStaff(staff);
  },

  getStaff(){ return JSON.parse(localStorage.getItem(this.KEY_STAFF)||'[]'); },
  getRequests(){ return JSON.parse(localStorage.getItem(this.KEY_REQUESTS)||'[]'); },
  getStaffById(id){ return this.getStaff().find(s=>s.id===id); },
  saveRequests(reqs){ localStorage.setItem(this.KEY_REQUESTS, JSON.stringify(reqs)); },
  saveStaff(staff){ localStorage.setItem(this.KEY_STAFF, JSON.stringify(staff)); },

  addRequest(req){
    const reqs = this.getRequests();
    const id = 'REQ'+String(Date.now()).slice(-6);
    const now = new Date();
    const ts = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const newReq = {...req, id, status:'申請中', approver:'', approvedAt:'', rejectedReason:'', createdAt:ts};
    reqs.unshift(newReq);
    this.saveRequests(reqs);
    return newReq;
  },

  approveRequest(reqId, approver){
    const reqs = this.getRequests();
    const req = reqs.find(r=>r.id===reqId);
    if(!req) return;
    req.status='承認済';
    req.approver=approver;
    const now = new Date();
    req.approvedAt=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    this.saveRequests(reqs);
    const staff = this.getStaff();
    const s = staff.find(s=>s.id===req.staffId);
    if(s){
      if(req.category==='夏期'){
        s.summerUsed = parseFloat((s.summerUsed + req.days).toFixed(1));
      } else {
        s.used = parseFloat((s.used + req.days).toFixed(1));
      }
      this.saveStaff(staff);
    }
  },

  rejectRequest(reqId, approver, reason){
    const reqs = this.getRequests();
    const req = reqs.find(r=>r.id===reqId);
    if(!req) return;
    req.status='却下'; req.approver=approver; req.rejectedReason=reason||'';
    const now = new Date();
    req.approvedAt=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    this.saveRequests(reqs);
  },

  reset(){
    localStorage.removeItem(this.KEY_STAFF);
    localStorage.removeItem(this.KEY_REQUESTS);
    this.init();
  },

  getRemain(s){ return parseFloat((s.grant + s.carry - s.used).toFixed(1)); },
  getSummerRemain(s){ return Math.max(0, (s.summerTotal||0) - (s.summerUsed||0)); },
  getObligDone(s){ return s.used >= 5; },

  // 時間給計算（給与規程第17・18条）
  calcHourlyWage(s){
    if(s.type==='パート') return s.hourlyWage || 0;
    if(!s.basicPay || !s.avgMonthlyHours) return 0;
    return Math.round((s.basicPay + (s.allowance||0)) / s.avgMonthlyHours);
  },
  calcOvertimePay(s, hours){ return Math.round(this.calcHourlyWage(s) * hours * 1.25); },
  calcNightPay(s, hours){ return Math.round(this.calcHourlyWage(s) * hours * 0.25); },
  calcHolidayPay(s, hours){ return Math.round(this.calcHourlyWage(s) * hours * 1.35); },
  calcDeductPay(s, hours){ return Math.round(this.calcHourlyWage(s) * hours); },
};
